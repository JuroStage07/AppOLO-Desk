import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RotateCcw,
  Plus,
  Clock3,
  CalendarDays,
  Trash2,
  CornerUpLeft,
  MoreVertical,
  CircleCheck,
  AlertTriangle,
  Minus,
  X,
  Wrench,
  User,
  LayoutGrid,
  ClipboardList,
  RefreshCw,
  Search,
  ChevronRight,
  Eye,
  ListChecks,
  Play,
  Pause,
  Timer,
  Lock,
} from "lucide-react";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import {
  addDoc,
  collection,
  collectionGroup,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteField,
} from "firebase/firestore";

const ACCENT = "#089F8A";
const BLUE = "#2563EB";
const AMBER = "#F59E0B";
const RED = "#FF4D73";

/** Estados persistidos en Firestore (colección solicitudesOT, campo OTState) */
const OT_STATE_SOLICITADA = "Solicitada";
const OT_STATE_EN_PROCESO = "En proceso";
const OT_STATE_REVISION = "En revisión";
const OT_STATE_FINALIZADA = "Finalizada";

/** Subcolección solicitudesOT/.../subtareas (campo `status`) */
const SUBTASK_STATUS_PENDIENTE = "Pendiente";
const SUBTASK_STATUS_COMPLETADA = "Completada";

const DRAG_MIME_SOLICITUD = "application/x-appolodesk-solicitud-id";
const DRAG_MIME_PROCESO_REVISION =
  "application/x-appolodesk-proceso-revision";
const DRAG_MIME_REVISION_PROCESO =
  "application/x-appolodesk-revision-proceso";

function isLocalOnlyOtId(id) {
  return typeof id === "string" && /^ot-\d+$/.test(id);
}

/** Pendientes muestran NroSolicitud completo (p. ej. SOL-OT-…); en proceso/revisión se quita el prefijo SOL-. */
function nroSolicitudParaOtEnTablero(raw) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return "";
  return /^SOL-/i.test(s) ? s.replace(/^SOL-/i, "") : s;
}

/** OT en proceso: solo con al menos una subtarea y todas completas (100%). */
function isProcesoOtSubtasksComplete(item) {
  if (!item || item.type !== "solicitud") return false;
  const total = Number(item.subtaskCount) || 0;
  const done = Number(item.subtaskCompletedCount) || 0;
  return total > 0 && done >= total;
}

/** Alineado a subtareas en Firestore (status / flags). */
function isSubtaskFirestoreCompleted(data) {
  if (!data || typeof data !== "object") return false;
  if (data.completed === true || data.done === true) return true;
  const raw = data.status ?? data.estado;
  if (raw == null || raw === "") return false;
  const s = String(raw).trim().toLowerCase();
  return (
    s === "completada" ||
    s === "completado" ||
    s === "finalizada" ||
    s === "finalizado" ||
    s === "terminada" ||
    s === "terminado" ||
    s === "done" ||
    s === "listo" ||
    s === "lista"
  );
}

function chronoTsToMillis(ts) {
  if (ts == null) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") {
    return (
      ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6)
    );
  }
  return null;
}

function formatChronoMs(ms) {
  const v = Math.max(0, Math.floor(Number(ms) || 0));
  const s = Math.floor(v / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function chronoWorkElapsedMs(row, nowMs) {
  const acc = Number(row.chronoWorkAccumMs) || 0;
  const t0 = chronoTsToMillis(row.chronoWorkStartedAt);
  if (t0 != null) return acc + (nowMs - t0);
  return acc;
}

function chronoDeadElapsedMs(row, nowMs) {
  const acc = Number(row.chronoDeadAccumMs) || 0;
  const t0 = chronoTsToMillis(row.chronoDeadStartedAt);
  if (t0 != null) return acc + (nowMs - t0);
  return acc;
}

function chronoWorkRunning(row) {
  return row.chronoWorkStartedAt != null;
}

function chronoDeadRunning(row) {
  return row.chronoDeadStartedAt != null;
}

function chronoQuiescent(row) {
  return !chronoWorkRunning(row) && !chronoDeadRunning(row);
}

/** Cierra tramos activos y deja solo acumulados (p. ej. al marcar subtarea completada). */
function buildSubtaskChronoFinalizeUpdate(row) {
  const now = Date.now();
  let wAcc = Number(row.chronoWorkAccumMs) || 0;
  const wStart = chronoTsToMillis(row.chronoWorkStartedAt);
  if (wStart != null) wAcc += now - wStart;
  let dAcc = Number(row.chronoDeadAccumMs) || 0;
  const dStart = chronoTsToMillis(row.chronoDeadStartedAt);
  if (dStart != null) dAcc += now - dStart;
  return {
    chronoWorkAccumMs: wAcc,
    chronoDeadAccumMs: dAcc,
    chronoWorkStartedAt: deleteField(),
    chronoDeadStartedAt: deleteField(),
  };
}

function normalizeSubtaskStats(v) {
  if (v && typeof v === "object" && typeof v.total === "number") {
    const total = Math.max(0, v.total);
    const completed = Math.min(
      Math.max(0, Number(v.completed) || 0),
      total
    );
    return { total, completed };
  }
  if (typeof v === "number") {
    const total = Math.max(0, v);
    return { total, completed: 0 };
  }
  return { total: 0, completed: 0 };
}

function mapSnapshotToPendingItem(d, subtaskStats = { total: 0, completed: 0 }) {
  const { total, completed } = normalizeSubtaskStats(subtaskStats);
  const data = d.data();
  return {
    id: d.id,
    type: "pending",
    checked: false,
    subtaskCount: total,
    subtaskCompletedCount: completed,
    priority:
      data.OTState === OT_STATE_SOLICITADA
        ? "SOLICITADA"
        : String(data.OTState || "PENDIENTE").toUpperCase(),
    priorityTone: "solicitada",
    taskTitle: data.nombreOT || "Sin nombre OT",
    asset: data.activoReferencia || "Activo no definido",
    duration: data.tipoProblema || "Sin tipo",
    schedule: data.departamento || "Sin departamento",
    date: data.fecha || "",
    nroSolicitud: data.NroSolicitud || "",
    solicitanteNombre: data.solicitanteNombre || "",
    solicitanteFicha: data.solicitanteFicha || "",
    lugarProblema: data.lugarProblema || "",
    tipoProblema: data.tipoProblema || "",
    descripcionOT: data.descripcionOT || "",
    estadoOT: data.OTState || OT_STATE_SOLICITADA,
    notas: data.notas || "",
    responsableNombre: "",
  };
}

/** Misma forma visual que pendientes; columnas proceso / revisión en el tablero */
function mapSnapshotToSolicitudCardItem(
  d,
  phase,
  subtaskStats = { total: 0, completed: 0 }
) {
  const { total, completed } = normalizeSubtaskStats(subtaskStats);
  const data = d.data();
  const isProceso = phase === "proceso";
  return {
    id: d.id,
    type: "solicitud",
    checked: false,
    subtaskCount: total,
    subtaskCompletedCount: completed,
    priority: isProceso ? "EN PROCESO" : "EN REVISIÓN",
    priorityTone: isProceso ? "proceso" : "revision",
    taskTitle: data.nombreOT || "Sin nombre OT",
    asset: data.activoReferencia || "Activo no definido",
    duration: data.tipoProblema || "Sin tipo",
    schedule: data.departamento || "Sin departamento",
    date: data.fecha || "",
    nroSolicitud: nroSolicitudParaOtEnTablero(data.NroSolicitud || ""),
    solicitanteNombre: data.solicitanteNombre || "",
    solicitanteFicha: data.solicitanteFicha || "",
    lugarProblema: data.lugarProblema || "",
    tipoProblema: data.tipoProblema || "",
    descripcionOT: data.descripcionOT || "",
    estadoOT: data.OTState || (isProceso ? OT_STATE_EN_PROCESO : OT_STATE_REVISION),
    notas: data.notas || "",
    responsableNombre: (data.responsableNombre && String(data.responsableNombre).trim()) || "",
  };
}

function pendingItemToProcesoSolicitudItem(item, responsable) {
  const name = responsable?.displayName?.trim() || "";
  return {
    ...item,
    type: "solicitud",
    checked: false,
    priority: "EN PROCESO",
    priorityTone: "proceso",
    estadoOT: OT_STATE_EN_PROCESO,
    responsableNombre: name,
    nroSolicitud: nroSolicitudParaOtEnTablero(item.nroSolicitud || ""),
  };
}

function profileIsMantenimientoStaff(data) {
  if (!data || typeof data !== "object") return false;
  if (data.active === false) return false;
  const role = data.role;
  if (role === "administrativo" || role === "dev") return true;
  return data.permisos != null && data.permisos.mantenimiento === true;
}

function displayNameFromProfile(uid, data) {
  const d = data || {};
  const s =
    (d.displayName && String(d.displayName).trim()) ||
    (d.username && String(d.username).trim()) ||
    (d.email && String(d.email).trim()) ||
    "";
  return s || uid;
}

async function fetchMantenimientoResponsables(tenantId, company) {
  const snap = await getDocs(collection(db, "profiles"));
  const rows = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!profileIsMantenimientoStaff(data)) return;
    if (tenantId && data.tenantId && data.tenantId !== tenantId) return;
    if (company && data.company && data.company !== company) return;
    rows.push({
      uid: docSnap.id,
      displayName: displayNameFromProfile(docSnap.id, data),
      numeroFicha: (data.numeroFicha && String(data.numeroFicha)) || "",
      role: data.role || "",
    });
  });
  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" })
  );
  return rows;
}

const DEPARTAMENTOS = [
  "Control",
  "Sistema",
  "Personal",
  "Comercio exterior",
  "Ventas",
  "CEDI",
  "Transportes",
  "Otro",
];

const LUGARES_PROBLEMA = [
  "Piso #1",
  "Piso #2",
  "Piso #3",
  "CEDI",
  "Parqueo",
  "Vehículo/Flota",
  "Otro",
];

const TIPOS_PROBLEMA = [
  "Albañeria",
  "Pisos",
  "Techos",
  "Goteras",
  "Canoas",
  "Cielo raso",
  "Instalación eléctrica",
  "Cañerías",
  "Carpintería",
  "Fontanería",
  "Pintura",
  "Soldadura",
  "Tanques sépticos",
  "Aire acondicionado",
  "Remodelaciones",
  "Puertas y portones",
  "Accesos",
  "Racks",
  "Equipos",
  "Rotulaciones",
  "Sistema de incendios",
  "Andenes de carga",
  "Banda transportadora",
  "Ilimunacion",
  "Baños",
  "Control de plagas",
  "Camaras / CCTV",
  "Otro",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const initialColumns = [
  {
    id: "pendientes",
    title: "Tareas Pendientes",
    subtitle: "Pendientes por convertir a OT",
    stripe: "#94A3B8",
    items: [],
  },
  {
    id: "proceso",
    title: "OTs en Proceso",
    subtitle: "Órdenes activas operativas",
    stripe: AMBER,
    items: [],
  },
  {
    id: "revision",
    title: "OTs en Revisión",
    subtitle: "Órdenes bajo validación",
    stripe: BLUE,
    items: [],
  },
];

function SoftChip({ icon, text, danger = false }) {
  return (
    <div style={{ ...ui.softChip, ...(danger ? ui.softChipDanger : {}) }}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function SubtasksChip({ count, onOpenList }) {
  const n = typeof count === "number" && count >= 0 ? count : 0;
  const label = n > 0 ? `Subtareas: ${n}` : "sin subtareas";
  const interactive = n > 0 && typeof onOpenList === "function";

  if (interactive) {
    return (
      <button
        type="button"
        style={{
          ...ui.subtasksMetaChip,
          cursor: "pointer",
          font: "inherit",
          margin: 0,
        }}
        title="Ver subtareas"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onOpenList();
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ListChecks size={12} strokeWidth={2.5} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div style={ui.subtasksMetaChip} title="Subtareas asignadas">
      <ListChecks size={12} strokeWidth={2.5} />
      <span>{label}</span>
    </div>
  );
}

function PriorityChip({ text, tone = "solicitada" }) {
  const chipStyle =
    tone === "proceso"
      ? ui.priorityChipProceso
      : tone === "revision"
        ? ui.priorityChipRevision
        : ui.priorityChip;
  const Icon =
    tone === "proceso" ? Minus : tone === "revision" ? CircleCheck : AlertTriangle;
  return (
    <div style={chipStyle}>
      <Icon size={13} strokeWidth={tone === "solicitada" ? undefined : 2.5} />
      {text}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={ui.progressTrack}>
        <div style={{ ...ui.progressFill, width: `${value}%` }} />
      </div>
      <div style={ui.progressMeta}>{value}% completado</div>
    </div>
  );
}

/** Barra subtareas en tarjeta del tablero (completadas / total). */
function CardSubtasksProgress({ completed, total }) {
  const t = typeof total === "number" && total >= 0 ? total : 0;
  const c =
    typeof completed === "number" && completed >= 0
      ? Math.min(completed, t)
      : 0;
  if (t <= 0) return null;
  const pct = Math.round((c / t) * 100);
  return (
    <div style={ui.cardSubtasksProgress}>
      <div style={ui.cardSubtasksProgressMeta}>
        <span>Progreso subtareas</span>
        <span>
          {c} / {t}
        </span>
      </div>
      <div style={ui.progressTrack}>
        <div style={{ ...ui.progressFill, width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TaskStatusIcon({ type }) {
  if (type === "minus") {
    return <Minus size={15} color={AMBER} strokeWidth={3} />;
  }

  return <AlertTriangle size={15} color={RED} />;
}

function CardMenu({ onClose, onDelete, onMove, canMove }) {
  return (
    <div style={ui.menu}>
      <button onClick={onClose} style={ui.menuItem}>
        <X size={15} />
        Cerrar menú
      </button>

      {canMove && (
        <button onClick={onMove} style={ui.menuItem}>
          <CornerUpLeft size={15} />
          Mover a siguiente columna
        </button>
      )}

      <button onClick={onDelete} style={{ ...ui.menuItem, color: "#B42318" }}>
        <Trash2 size={15} />
        Eliminar
      </button>
    </div>
  );
}

function PendingCard({
  item,
  columnIndex,
  totalColumns,
  onDelete,
  onMoveNext,
  onOpenDetail,
  onOpenSubtasksList,
  openMenuId,
  setOpenMenuId,
  dragEnabled = false,
  dragVariant = "pending",
  onBoardDragStart,
  onBoardDragEnd,
}) {
  const menuOpen = openMenuId === item.id;
  const canMoveToNextColumn =
    columnIndex < totalColumns - 1 &&
    (columnIndex !== 1 || isProcesoOtSubtasksComplete(item));

  return (
    <div
      style={{
        ...ui.card,
        ...(dragEnabled ? ui.cardDraggable : {}),
      }}
      draggable={dragEnabled}
      title={
        dragVariant === "procesoRevision"
          ? "Arrastrá a «OTs en Revisión» para enviar la OT"
          : dragVariant === "revisionProceso"
            ? "Arrastrá a «OTs en Proceso» para volver la OT a proceso"
            : undefined
      }
      onDragStart={(e) => {
        if (!dragEnabled) return;
        if (dragVariant === "procesoRevision") {
          e.dataTransfer.setData(DRAG_MIME_PROCESO_REVISION, item.id);
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
          onBoardDragStart?.("procesoRevision");
        } else if (dragVariant === "revisionProceso") {
          e.dataTransfer.setData(DRAG_MIME_REVISION_PROCESO, item.id);
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
          onBoardDragStart?.("revisionProceso");
        } else {
          e.dataTransfer.setData(DRAG_MIME_SOLICITUD, item.id);
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
          onBoardDragStart?.("pending");
        }
      }}
      onDragEnd={() => {
        if (!dragEnabled) return;
        onBoardDragEnd?.();
      }}
    >
      <div style={ui.cardTopAccent} />

      <div style={ui.pendingHead}>
        <button
          type="button"
          style={ui.pendingCodeBtn}
          onClick={() => onOpenDetail(item.id)}
          title="Ver detalle de la solicitud"
        >
          {item.nroSolicitud || "Sin número"}
        </button>

        <div style={ui.pendingHeadChips}>
          <PriorityChip
            text={item.priority || "PENDIENTE"}
            tone={item.priorityTone || "solicitada"}
          />
          <SubtasksChip
            count={item.subtaskCount}
            onOpenList={
              item.subtaskCount > 0 && onOpenSubtasksList
                ? () => onOpenSubtasksList(item)
                : undefined
            }
          />
        </div>
      </div>

      <CardSubtasksProgress
        completed={item.subtaskCompletedCount}
        total={item.subtaskCount}
      />

      <div style={ui.pendingBodyBox}>
        <div style={ui.cardMicroLabel}>NOMBRE OT</div>
        <div style={ui.pendingTitle}>{item.taskTitle}</div>
      </div>

      <div style={ui.assetLine}>
        <Wrench size={14} />
        <span>{item.asset}</span>
      </div>

      <div style={ui.pendingInfoGrid}>
        <div style={ui.pendingInfoBox}>
          <div style={ui.pendingInfoLabel}>Departamento</div>
          <div style={ui.pendingInfoValue}>{item.schedule || "-"}</div>
        </div>

        <div style={ui.pendingInfoBox}>
          <div style={ui.pendingInfoLabel}>Lugar</div>
          <div style={ui.pendingInfoValue}>{item.lugarProblema || "-"}</div>
        </div>

        <div style={ui.pendingInfoBox}>
          <div style={ui.pendingInfoLabel}>Tipo</div>
          <div style={ui.pendingInfoValue}>{item.tipoProblema || "-"}</div>
        </div>

        <div style={ui.pendingInfoBox}>
          <div style={ui.pendingInfoLabel}>Solicitante</div>
          <div style={ui.pendingInfoValue}>
            {item.solicitanteNombre || "-"}
          </div>
        </div>

        {!!(item.responsableNombre && String(item.responsableNombre).trim()) && (
          <div
            style={{
              ...ui.pendingInfoBox,
              gridColumn: "1 / -1",
            }}
          >
            <div style={ui.pendingInfoLabel}>Responsable (mantenimiento)</div>
            <div style={ui.pendingInfoValue}>{item.responsableNombre}</div>
          </div>
        )}
      </div>

      {!!item.descripcionOT && (
        <div style={ui.pendingDescriptionBox}>
          <div style={ui.cardMicroLabel}>DESCRIPCIÓN</div>
          <div style={ui.pendingDescription}>{item.descripcionOT}</div>
        </div>
      )}

      <div style={ui.rowWrap}>
        <SoftChip icon={<Clock3 size={13} />} text={item.tipoProblema || "-"} />
        <SoftChip icon={<CalendarDays size={13} />} text={item.estadoOT || "Solicitada"} />
      </div>

      <div style={ui.cardDivider} />

      <div style={ui.cardActionsRow}>
        <SoftChip
          icon={<CalendarDays size={13} />}
          text={item.date || "-"}
        />

        <div style={ui.actionGroup}>
          <button
            type="button"
            style={ui.iconBtn}
            onClick={() => onOpenDetail(item.id)}
            title="Ver detalle"
          >
            <Eye size={17} />
          </button>

          <button
            type="button"
            style={{
              ...ui.iconBtn,
              ...(!canMoveToNextColumn && columnIndex === 1
                ? { opacity: 0.35, cursor: "not-allowed" }
                : {}),
            }}
            title={
              columnIndex === 1 && !isProcesoOtSubtasksComplete(item)
                ? "Completá todas las subtareas (100%) para pasar a revisión"
                : "Mover a la columna siguiente"
            }
            onClick={() => {
              if (!canMoveToNextColumn && columnIndex === 1) return;
              onMoveNext(item.id, columnIndex);
            }}
          >
            <CornerUpLeft size={17} />
          </button>

          <button
            type="button"
            style={ui.iconBtn}
            onClick={() => onDelete(item.id, columnIndex)}
          >
            <Trash2 size={17} />
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              style={ui.iconBtn}
              onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
            >
              <MoreVertical size={17} />
            </button>

            {menuOpen && (
              <CardMenu
                onClose={() => setOpenMenuId(null)}
                onDelete={() => {
                  onDelete(item.id, columnIndex);
                  setOpenMenuId(null);
                }}
                onMove={() => {
                  onMoveNext(item.id, columnIndex);
                  setOpenMenuId(null);
                }}
                canMove={canMoveToNextColumn}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OTCard({
  item,
  columnIndex,
  totalColumns,
  onDelete,
  onMoveNext,
  openMenuId,
  setOpenMenuId,
}) {
  const menuOpen = openMenuId === item.id;

  return (
    <div style={ui.card}>
      <div style={ui.cardTopAccent} />

      <div style={ui.otCode}>{item.ot}</div>

      <div style={ui.statGrid}>
        <div style={ui.statBox}>
          <div style={ui.statLabel}>ACTIVO: {item.activo}</div>
          <div style={ui.statValueBox}>
            <CircleCheck size={14} color={ACCENT} />
            <span>1</span>
          </div>
        </div>

        <div style={ui.statBox}>
          <div style={ui.statLabel}>TAREA: {item.tarea}</div>
          <div style={ui.statValueBox}>
            <TaskStatusIcon type={item.taskIcon} />
            <span>1</span>
          </div>
        </div>
      </div>

      <div style={ui.otTitle}>{item.taskTitle}</div>

      <ProgressBar value={item.progress} />

      <div style={ui.rowWrap}>
        <SoftChip icon={<Clock3 size={13} />} text={item.duration} />
        <SoftChip icon={<CalendarDays size={13} />} text={item.date} />
      </div>

      <div style={ui.otFooter}>
        <div style={ui.assigneeWrap}>
          {item.avatar ? (
            <img src={item.avatar} alt={item.assignee} style={ui.avatar} />
          ) : (
            <div style={ui.avatarFallback}>
              <User size={15} />
            </div>
          )}

          <div style={ui.assigneeName}>{item.assignee}</div>
        </div>

        <div style={{ position: "relative" }}>
          <button
            style={ui.iconBtn}
            onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
          >
            <MoreVertical size={17} />
          </button>

          {menuOpen && (
            <CardMenu
              onClose={() => setOpenMenuId(null)}
              onDelete={() => {
                onDelete(item.id, columnIndex);
                setOpenMenuId(null);
              }}
              onMove={() => {
                onMoveNext(item.id, columnIndex);
                setOpenMenuId(null);
              }}
              canMove={columnIndex < totalColumns - 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Column({
  column,
  columnIndex,
  totalColumns,
  onDelete,
  onMoveNext,
  onOpenDetail,
  onOpenSubtasksList,
  openMenuId,
  setOpenMenuId,
  loading = false,
  onDropPendingToProceso,
  onDropProcesoToRevision,
  onDropRevisionToProceso,
  highlightProcesoDrop = false,
  highlightRevisionDrop = false,
  onBoardDragStart,
  onBoardDragEnd,
}) {
  const isProceso = column.id === "proceso";
  const isRevision = column.id === "revision";
  const showProcesoHint = isProceso && highlightProcesoDrop;
  const showRevisionHint = isRevision && highlightRevisionDrop;

  const dragOverHasProcesoRevisionMime = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.some(
      (t) => t === DRAG_MIME_PROCESO_REVISION || t.includes("proceso-revision")
    );
  };

  return (
    <div style={ui.column}>
      <div style={ui.columnHead}>
        <div style={ui.columnHeadLeft}>
          <div style={{ ...ui.columnStripe, background: column.stripe }} />
          <div>
            <div style={ui.columnTitle}>{column.title}</div>
            <div style={ui.columnSubtitle}>{column.subtitle}</div>
          </div>
        </div>

        <div style={ui.columnHeadRight}>
          <div style={ui.countPill}>{column.items.length}</div>
          <button style={ui.iconBtn}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          ...ui.columnScroll,
          ...(showProcesoHint ? ui.columnScrollDropTarget : {}),
          ...(showRevisionHint ? ui.columnScrollDropTargetRevision : {}),
        }}
        onDragOverCapture={
          isProceso
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            : isRevision
              ? (e) => {
                  if (!dragOverHasProcesoRevisionMime(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              : undefined
        }
        onDropCapture={
          isProceso
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idBack = e.dataTransfer
                  .getData(DRAG_MIME_REVISION_PROCESO)
                  ?.trim();
                if (idBack) {
                  onDropRevisionToProceso?.(idBack);
                  return;
                }
                const idPen =
                  e.dataTransfer.getData(DRAG_MIME_SOLICITUD)?.trim() ||
                  e.dataTransfer.getData("text/plain")?.trim();
                if (idPen) onDropPendingToProceso?.(idPen);
              }
            : isRevision
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData(DRAG_MIME_PROCESO_REVISION);
                  if (!id?.trim()) return;
                  onDropProcesoToRevision?.(id.trim());
                }
              : undefined
        }
      >
        {loading ? (
          <div style={ui.emptyColumn}>
            <ClipboardList size={20} />
            <div>Cargando solicitudes...</div>
          </div>
        ) : column.items.length === 0 ? (
          <div style={ui.emptyColumn}>
            <ClipboardList size={20} />
            <div>
              {isProceso
                ? "Arrastrá una tarea pendiente aquí, o desde Revisión para volver a proceso."
                : isRevision
                  ? "Las OT en proceso con subtareas al 100% se pueden arrastrar aquí."
                  : "No hay elementos en esta columna."}
            </div>
          </div>
        ) : (
          column.items.map((item) =>
            item.type === "pending" || item.type === "solicitud" ? (
              <PendingCard
                key={item.id}
                item={item}
                columnIndex={columnIndex}
                totalColumns={totalColumns}
                onDelete={onDelete}
                onMoveNext={onMoveNext}
                onOpenDetail={onOpenDetail}
                onOpenSubtasksList={onOpenSubtasksList}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                dragEnabled={
                  column.id === "pendientes" ||
                  (column.id === "proceso" &&
                    item.type === "solicitud" &&
                    isProcesoOtSubtasksComplete(item)) ||
                  (column.id === "revision" && item.type === "solicitud")
                }
                dragVariant={
                  column.id === "proceso" &&
                  item.type === "solicitud" &&
                  isProcesoOtSubtasksComplete(item)
                    ? "procesoRevision"
                    : column.id === "revision" && item.type === "solicitud"
                      ? "revisionProceso"
                      : "pending"
                }
                onBoardDragStart={onBoardDragStart}
                onBoardDragEnd={onBoardDragEnd}
              />
            ) : (
              <OTCard
                key={item.id}
                item={item}
                columnIndex={columnIndex}
                totalColumns={totalColumns}
                onDelete={onDelete}
                onMoveNext={onMoveNext}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
              />
            )
          )
        )}
      </div>
    </div>
  );
}

function SearchSelectModal({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  if (!open) return null;

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={picker.backdrop} onClick={onClose}>
      <div style={picker.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={picker.header}>
          <div style={picker.title}>{title}</div>
          <button style={picker.close} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={picker.searchWrap}>
          <Search size={16} color="#64748B" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={picker.searchInput}
          />
        </div>

        <div style={picker.list}>
          {filtered.length === 0 ? (
            <div style={picker.empty}>No hay resultados.</div>
          ) : (
            filtered.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  style={{
                    ...picker.item,
                    ...(active ? picker.itemActive : {}),
                  }}
                  onClick={() => {
                    onSelect(opt);
                    onClose();
                  }}
                >
                  <span>{opt}</span>
                  <ChevronRight size={16} />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function SubtasksListModal({
  open,
  onClose,
  solicitudId,
  nroLabel,
  nombreOT,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [chronoBusyId, setChronoBusyId] = useState(null);
  const [tick, setTick] = useState(0);
  const [otStateLive, setOtStateLive] = useState("");

  useEffect(() => {
    if (!open || !solicitudId?.trim()) {
      setOtStateLive("");
      return;
    }
    const r = doc(db, "solicitudesOT", solicitudId);
    const unsub = onSnapshot(
      r,
      (snap) => {
        if (!snap.exists()) {
          setOtStateLive("");
          return;
        }
        setOtStateLive(snap.data()?.OTState || OT_STATE_SOLICITADA);
      },
      (e) => {
        console.error(e);
        setOtStateLive("");
      }
    );
    return () => unsub();
  }, [open, solicitudId]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open || !solicitudId) {
      setRows([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const ref = collection(db, "solicitudesOT", solicitudId, "subtareas");
    const q = query(ref, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError("");
      },
      (e) => {
        console.error(e);
        setError("No se pudieron cargar las subtareas.");
        setRows([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [open, solicitudId]);

  const nowMs = useMemo(() => Date.now(), [tick]);

  const subRef = (subId) =>
    doc(db, "solicitudesOT", solicitudId, "subtareas", subId);

  const handleStartWorkChrono = async (row) => {
    if (!solicitudId?.trim() || !row?.id || chronoBusyId) return;
    if (otStateLive === OT_STATE_FINALIZADA) return;
    if (!otStateLive) return;
    if (isSubtaskFirestoreCompleted(row)) return;
    if (!chronoQuiescent(row)) return;
    try {
      setChronoBusyId(row.id);
      await updateDoc(subRef(row.id), {
        chronoWorkAccumMs: Number(row.chronoWorkAccumMs) || 0,
        chronoDeadAccumMs: Number(row.chronoDeadAccumMs) || 0,
        chronoWorkStartedAt: serverTimestamp(),
        chronoDeadStartedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert(
        "No se pudo iniciar el cronómetro. Revisá reglas Firestore (campos chrono* en subtareas)."
      );
    } finally {
      setChronoBusyId(null);
    }
  };

  const handleTiempoMuerto = async (row) => {
    if (!solicitudId?.trim() || !row?.id || chronoBusyId) return;
    if (otStateLive === OT_STATE_FINALIZADA) return;
    if (!otStateLive) return;
    if (isSubtaskFirestoreCompleted(row)) return;
    if (!chronoWorkRunning(row) || chronoDeadRunning(row)) return;
    const t0 = chronoTsToMillis(row.chronoWorkStartedAt);
    let wAcc = Number(row.chronoWorkAccumMs) || 0;
    if (t0 != null) wAcc += Date.now() - t0;
    try {
      setChronoBusyId(row.id);
      await updateDoc(subRef(row.id), {
        chronoWorkAccumMs: wAcc,
        chronoWorkStartedAt: deleteField(),
        chronoDeadStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo registrar tiempo muerto.");
    } finally {
      setChronoBusyId(null);
    }
  };

  const handleDetenerTiempoMuerto = async (row) => {
    if (!solicitudId?.trim() || !row?.id || chronoBusyId) return;
    if (otStateLive === OT_STATE_FINALIZADA) return;
    if (!otStateLive) return;
    if (isSubtaskFirestoreCompleted(row)) return;
    if (!chronoDeadRunning(row)) return;
    const t0 = chronoTsToMillis(row.chronoDeadStartedAt);
    let dAcc = Number(row.chronoDeadAccumMs) || 0;
    if (t0 != null) dAcc += Date.now() - t0;
    try {
      setChronoBusyId(row.id);
      await updateDoc(subRef(row.id), {
        chronoDeadAccumMs: dAcc,
        chronoDeadStartedAt: deleteField(),
        chronoWorkStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo detener el tiempo muerto.");
    } finally {
      setChronoBusyId(null);
    }
  };

  const handleToggleSubtaskStatus = async (row) => {
    if (!solicitudId?.trim() || !row?.id || chronoBusyId) return;
    if (!otStateLive) return;
    if (otStateLive === OT_STATE_FINALIZADA) {
      alert("La OT está finalizada. No se pueden modificar subtareas ni tiempos.");
      return;
    }
    const currentlyDone = isSubtaskFirestoreCompleted(row);
    const nextStatus = currentlyDone
      ? SUBTASK_STATUS_PENDIENTE
      : SUBTASK_STATUS_COMPLETADA;
    if (
      nextStatus === SUBTASK_STATUS_PENDIENTE &&
      otStateLive === OT_STATE_REVISION
    ) {
      alert(
        "En revisión no podés volver una subtarea a pendiente. Solo se permite mientras la OT está en proceso."
      );
      return;
    }
    try {
      setChronoBusyId(row.id);
      if (nextStatus === SUBTASK_STATUS_COMPLETADA) {
        await updateDoc(subRef(row.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
          ...buildSubtaskChronoFinalizeUpdate(row),
        });
      } else {
        await updateDoc(subRef(row.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo actualizar el estado de la subtarea.");
    } finally {
      setChronoBusyId(null);
    }
  };

  if (!open) return null;

  const titleOf = (row) => row?.title || row?.nombre || "Sin título";
  const descOf = (row) => {
    const d = row?.description ?? row?.descripcion;
    if (d == null || String(d).trim() === "") return "Sin descripción";
    return String(d);
  };
  const statusOf = (row) => row?.status || row?.estado || "—";

  const listWrap = {
    maxHeight: "min(420px, 52vh)",
    overflowY: "auto",
    padding: "0 14px 14px",
  };

  const doneInList = rows.filter((r) => isSubtaskFirestoreCompleted(r)).length;
  const otFinalizada = otStateLive === OT_STATE_FINALIZADA;
  const otRevision = otStateLive === OT_STATE_REVISION;
  const otStateReady = !!otStateLive;
  const chronoLockedByOt = otFinalizada || !otStateReady;

  const btnChronoSecondary = {
    fontSize: 11,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #E2E8F0",
    background: "#fff",
    cursor: "pointer",
    color: "#0F172A",
  };

  const btnTiempoMuerto = {
    ...btnChronoSecondary,
    border: `1px solid rgba(245, 158, 11, 0.45)`,
    background: "#FFFBEB",
    color: "#B45309",
  };

  const btnDetenerMuerto = {
    ...btnChronoSecondary,
    border: `1px solid rgba(37, 99, 235, 0.35)`,
    background: "#EFF6FF",
    color: "#1D4ED8",
  };

  return (
    <div style={{ ...modal.backdrop, zIndex: 10050 }} onClick={onClose}>
      <div
        style={{
          ...modal.sheet,
          maxHeight: "min(640px, 92vh)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtasks-modal-title"
      >
        <div style={modal.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={modal.icon}>
              <ListChecks size={18} />
            </div>
            <div>
              <div id="subtasks-modal-title" style={modal.title}>
                Subtareas
              </div>
              <div style={modal.sub}>
                {nroLabel || solicitudId}
                {nombreOT ? ` · ${nombreOT}` : ""}
              </div>
              {!loading && !error && rows.length > 0 ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#64748B",
                  }}
                >
                  {doneInList} de {rows.length} subtareas completadas
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            style={modal.close}
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {otFinalizada ? (
          <div
            style={{
              margin: "0 18px 0",
              padding: "10px 12px",
              borderRadius: 12,
              background: "#F1F5F9",
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              border: "1px solid #E2E8F0",
            }}
          >
            OT finalizada: cronómetros y cambios de estado en solo lectura.
          </div>
        ) : otRevision ? (
          <div
            style={{
              margin: "0 18px 0",
              padding: "10px 12px",
              borderRadius: 12,
              background: "#FFFBEB",
              fontSize: 12,
              fontWeight: 700,
              color: "#92400E",
              border: "1px solid rgba(245, 158, 11, 0.35)",
            }}
          >
            En revisión: no podés volver una subtarea completada a pendiente (solo
            con la OT en proceso). Para agregar subtareas, la OT también debe estar
            en proceso.
          </div>
        ) : null}

        <div style={listWrap}>
          {loading ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "#64748B",
                fontWeight: 700,
              }}
            >
              Cargando…
            </div>
          ) : error ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "#B42318",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "#64748B",
                fontWeight: 700,
              }}
            >
              No hay subtareas registradas.
            </div>
          ) : (
            <ul
              role="list"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: 0,
              }}
            >
              {rows.map((row, index) => {
                const done = isSubtaskFirestoreCompleted(row);
                const busy = chronoBusyId === row.id;
                const workRun = chronoWorkRunning(row);
                const deadRun = chronoDeadRunning(row);
                const quiet = chronoQuiescent(row);
                const wMs = chronoWorkElapsedMs(row, nowMs);
                const dMs = chronoDeadElapsedMs(row, nowMs);
                const showDead =
                  deadRun || (Number(row.chronoDeadAccumMs) || 0) > 0 || dMs > 0;

                return (
                  <li
                    key={row.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "12px 0",
                      borderBottom:
                        index < rows.length - 1 ? "1px solid #EEF1F7" : "none",
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        chronoLockedByOt ||
                        done ||
                        !!chronoBusyId ||
                        !quiet ||
                        deadRun ||
                        workRun
                      }
                      aria-label={
                        otFinalizada
                          ? "Solo lectura: OT finalizada"
                          : !otStateReady
                            ? "Cargando estado de la OT"
                            : done
                              ? "Cronómetro detenido (subtarea completada)"
                              : quiet
                                ? "Iniciar cronómetro de trabajo"
                                : workRun
                                  ? "Cronómetro de trabajo en curso"
                                  : deadRun
                                    ? "Tiempo muerto en curso"
                                    : "Reanudar cronómetro"
                      }
                      title={
                        otFinalizada
                          ? "La OT está finalizada"
                          : !otStateReady
                            ? undefined
                            : done
                              ? otRevision
                                ? "En revisión no se puede volver a pendiente"
                                : "Marcá como pendiente para volver a medir tiempo"
                              : quiet
                                ? "Iniciar / reanudar cronómetro de trabajo"
                                : undefined
                      }
                      onClick={() => void handleStartWorkChrono(row)}
                      style={{
                        flexShrink: 0,
                        marginTop: 0,
                        marginLeft: 0,
                        padding: 6,
                        display: "grid",
                        placeItems: "center",
                        border: "none",
                        background:
                          chronoLockedByOt && !done
                            ? "rgba(100,116,139,0.1)"
                            : done
                              ? "rgba(100,116,139,0.1)"
                              : workRun || deadRun
                                ? "rgba(8,159,138,0.08)"
                                : "transparent",
                        borderRadius: 12,
                        cursor:
                          !chronoLockedByOt &&
                          !done &&
                          quiet &&
                          !chronoBusyId
                            ? "pointer"
                            : "default",
                        opacity:
                          busy
                            ? 0.65
                            : chronoBusyId && !busy
                              ? 0.45
                              : done || (chronoLockedByOt && !done)
                                ? 0.75
                                : 1,
                      }}
                    >
                      {chronoLockedByOt && !done ? (
                        <Lock size={22} color="#94A3B8" strokeWidth={2.5} />
                      ) : done ? (
                        <CircleCheck
                          size={22}
                          color="#94A3B8"
                          strokeWidth={2.5}
                        />
                      ) : deadRun ? (
                        <Pause size={22} color={AMBER} strokeWidth={2.5} />
                      ) : workRun ? (
                        <Timer size={22} color={ACCENT} strokeWidth={2.5} />
                      ) : (
                        <Play size={22} color={ACCENT} strokeWidth={2.5} />
                      )}
                    </button>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: "#0F172A",
                            opacity: done ? 0.88 : 1,
                          }}
                        >
                          {titleOf(row)}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 900,
                            letterSpacing: 0.12,
                            textTransform: "uppercase",
                            color: done ? ACCENT : "#64748B",
                            background: done
                              ? "rgba(8,159,138,0.12)"
                              : "#F1F5F9",
                            padding: "4px 8px",
                            borderRadius: 8,
                          }}
                        >
                          {statusOf(row)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#475467",
                          lineHeight: 1.45,
                        }}
                      >
                        {descOf(row)}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                          alignItems: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span
                          style={{
                            color: done
                              ? "#64748B"
                              : workRun
                                ? ACCENT
                                : "#475569",
                          }}
                        >
                          Trabajo: {formatChronoMs(wMs)}
                          {done
                            ? " · detenido"
                            : workRun
                              ? " · en curso"
                              : ""}
                        </span>
                        {showDead ? (
                          <span
                            style={{
                              color: done
                                ? "#64748B"
                                : deadRun
                                  ? AMBER
                                  : "#64748B",
                            }}
                          >
                            Tiempo muerto: {formatChronoMs(dMs)}
                            {done
                              ? " · detenido"
                              : deadRun
                                ? " · en curso"
                                : ""}
                          </span>
                        ) : null}
                      </div>

                      {done ? (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#94A3B8",
                          }}
                        >
                          {otFinalizada
                            ? "OT finalizada: solo lectura."
                            : otRevision
                              ? "En revisión no podés volver esta subtarea a pendiente."
                              : "Cronómetros bloqueados mientras la subtarea está completada. Marcá como pendiente para reanudar el conteo."}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          style={btnTiempoMuerto}
                          disabled={
                            chronoLockedByOt ||
                            done ||
                            !!chronoBusyId ||
                            !workRun ||
                            deadRun
                          }
                          onClick={() => void handleTiempoMuerto(row)}
                        >
                          Tiempo muerto
                        </button>
                        <button
                          type="button"
                          style={btnDetenerMuerto}
                          disabled={
                            chronoLockedByOt ||
                            done ||
                            !!chronoBusyId ||
                            !deadRun
                          }
                          onClick={() => void handleDetenerTiempoMuerto(row)}
                        >
                          Detener tiempo muerto
                        </button>
                        <button
                          type="button"
                          style={{
                            ...btnChronoSecondary,
                            fontWeight: 700,
                            color: "#64748B",
                            border: "none",
                            background: "transparent",
                            textDecoration: "underline",
                          }}
                          disabled={
                            !!chronoBusyId ||
                            chronoLockedByOt ||
                            (done && otRevision)
                          }
                          onClick={() => void handleToggleSubtaskStatus(row)}
                        >
                          {done
                            ? "Marcar como pendiente"
                            : "Marcar como completada"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div style={modal.actions}>
          <button type="button" style={ui.btnGhost} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmSendToRevisionModal({
  open,
  onClose,
  onConfirm,
  nroLabel,
  nombreOT,
}) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ ...modal.backdrop, zIndex: 10050 }}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        style={modal.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-revision-title"
      >
        <div style={modal.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                ...modal.icon,
                background: "rgba(37, 99, 235, 0.08)",
                border: "1px solid rgba(37, 99, 235, 0.28)",
                color: BLUE,
              }}
            >
              <CircleCheck size={18} strokeWidth={2.5} />
            </div>
            <div>
              <div id="confirm-revision-title" style={modal.title}>
                Enviar OT a revisión
              </div>
              <div style={modal.sub}>
                Todas las subtareas están completas. ¿Pasamos esta orden a la
                columna de revisión?
              </div>
            </div>
          </div>
          <button
            type="button"
            style={modal.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "0 14px 16px", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B" }}>
            {nroLabel || "—"}
            {nombreOT ? ` · ${nombreOT}` : ""}
          </div>
        </div>

        <div style={modal.actions}>
          <button
            type="button"
            style={ui.btnGhost}
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            style={ui.btnPrimary}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Guardando…" : "Sí, enviar a revisión"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignResponsableModal({
  open,
  onClose,
  onConfirm,
  solicitudId,
  nroSolicitud,
  nombreOT,
  tenantId,
  company,
}) {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSearch("");
    setLoadError("");
    setSelectedUid(null);
    setCandidates([]);

    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        const list = await fetchMantenimientoResponsables(
          tenantId || "",
          company || ""
        );
        if (!cancelled) setCandidates(list);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setLoadError(
            "No se pudo cargar el listado. Si usás permisos de mantenimiento pero no sos dev, pedí que en Firestore se permita leer perfiles necesarios para asignar responsables."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, company]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          (c.numeroFicha && c.numeroFicha.toLowerCase().includes(q)) ||
          c.uid.toLowerCase().includes(q)
      )
    : candidates;

  const selected = candidates.find((c) => c.uid === selectedUid);

  const handleConfirm = async () => {
    if (!selected || !solicitudId) return;
    try {
      setSaving(true);
      await onConfirm(solicitudId, {
        uid: selected.uid,
        displayName: selected.displayName,
      });
      onClose();
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "No se pudo completar la acción. Intentá de nuevo.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...modal.backdrop, zIndex: 10050 }} onClick={onClose}>
      <div
        style={modal.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-responsable-title"
      >
        <div style={modal.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={modal.icon}>
              <User size={18} />
            </div>
            <div>
              <div id="assign-responsable-title" style={modal.title}>
                Responsable de la OT
              </div>
              <div style={modal.sub}>
                Elegí quién ejecuta esta orden en mantenimiento. Solo aparecen
                perfiles con permiso de mantenimiento, admin o dev.
              </div>
            </div>
          </div>
          <button
            type="button"
            style={modal.close}
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "0 14px 10px", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B" }}>
            {nroSolicitud || solicitudId}
            {nombreOT ? ` · ${nombreOT}` : ""}
          </div>
        </div>

        <div style={picker.searchWrap}>
          <Search size={18} color="#64748B" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, ficha o UID…"
            style={picker.searchInput}
            disabled={loading || saving}
          />
        </div>

        <div style={{ ...picker.list, maxHeight: "min(360px, 42vh)" }}>
          {loading ? (
            <div style={picker.empty}>Cargando personal…</div>
          ) : loadError ? (
            <div style={{ ...picker.empty, color: "#B42318" }}>{loadError}</div>
          ) : filtered.length === 0 ? (
            <div style={picker.empty}>
              No hay usuarios que cumplan el criterio o el filtro de búsqueda.
            </div>
          ) : (
            filtered.map((c) => {
              const active = c.uid === selectedUid;
              return (
                <button
                  key={c.uid}
                  type="button"
                  style={{
                    ...picker.item,
                    ...(active ? picker.itemActive : {}),
                    flexDirection: "column",
                    alignItems: "stretch",
                  }}
                  onClick={() => setSelectedUid(c.uid)}
                >
                  <span>{c.displayName}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#64748B",
                      marginTop: 4,
                    }}
                  >
                    {c.numeroFicha
                      ? `Ficha ${c.numeroFicha} · `
                      : ""}
                    {c.role}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={modal.actions}>
          <button
            type="button"
            style={ui.btnGhost}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            style={ui.btnPrimary}
            onClick={() => void handleConfirm()}
            disabled={!selected || saving}
          >
            {saving ? "Guardando…" : "Confirmar y mover a en proceso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewOTModal({ open, onClose, onCreate }) {
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [picker, setPicker] = useState({
    departamento: false,
    lugarProblema: false,
    tipoProblema: false,
  });

  const [form, setForm] = useState({
    solicitanteNombre: "",
    solicitanteFicha: "",
    fecha: todayISO(),
    nombreOT: "",
    activoReferencia: "",
    departamento: "",
    departamentoOtro: "",
    lugarProblema: "",
    lugarProblemaOtro: "",
    tipoProblema: "",
    tipoProblemaOtro: "",
    descripcionOT: "",
    notas: "",
  });

  useEffect(() => {
    if (!open) return;

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const profileRef = doc(db, "profiles", uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setForm((prev) => ({
            ...prev,
            solicitanteNombre: data?.displayName || "",
            solicitanteFicha: data?.numeroFicha || "",
          }));
        } else {
          setForm((prev) => ({
            ...prev,
            solicitanteNombre:
              auth.currentUser?.displayName ||
              auth.currentUser?.email ||
              "",
            solicitanteFicha: "",
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setForm({
        solicitanteNombre: "",
        solicitanteFicha: "",
        fecha: todayISO(),
        nombreOT: "",
        activoReferencia: "",
        departamento: "",
        departamentoOtro: "",
        lugarProblema: "",
        lugarProblemaOtro: "",
        tipoProblema: "",
        tipoProblemaOtro: "",
        descripcionOT: "",
        notas: "",
      });
      setPicker({
        departamento: false,
        lugarProblema: false,
        tipoProblema: false,
      });
    }
  }, [open]);

  if (!open) return null;

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const departamentoFinal =
    form.departamento === "Otro"
      ? form.departamentoOtro.trim()
      : form.departamento;

  const lugarProblemaFinal =
    form.lugarProblema === "Otro"
      ? form.lugarProblemaOtro.trim()
      : form.lugarProblema;

  const tipoProblemaFinal =
    form.tipoProblema === "Otro"
      ? form.tipoProblemaOtro.trim()
      : form.tipoProblema;

  const canSave =
    !saving &&
    !loadingProfile &&
    form.fecha.trim() &&
    form.nombreOT.trim() &&
    form.activoReferencia.trim() &&
    form.departamento.trim() &&
    departamentoFinal &&
    form.lugarProblema.trim() &&
    lugarProblemaFinal &&
    form.tipoProblema.trim() &&
    tipoProblemaFinal &&
    form.descripcionOT.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;

    try {
      setSaving(true);

      const now = Date.now();
      const NroSolicitud = `SOL-OT-${now}`;

      const payload = {
        solicitanteNombre: form.solicitanteNombre?.trim() || "",
        solicitanteFicha: form.solicitanteFicha?.trim() || "",
        fecha: form.fecha,
        nombreOT: form.nombreOT.trim(),
        activoReferencia: form.activoReferencia.trim(),

        departamento: departamentoFinal,
        departamentoBase: form.departamento,
        departamentoOtro:
          form.departamento === "Otro" ? form.departamentoOtro.trim() : "",

        lugarProblema: lugarProblemaFinal,
        lugarProblemaBase: form.lugarProblema,
        lugarProblemaOtro:
          form.lugarProblema === "Otro" ? form.lugarProblemaOtro.trim() : "",

        tipoProblema: tipoProblemaFinal,
        tipoProblemaBase: form.tipoProblema,
        tipoProblemaOtro:
          form.tipoProblema === "Otro" ? form.tipoProblemaOtro.trim() : "",

        descripcionOT: form.descripcionOT.trim(),
        notas: form.notas.trim(),

        OTState: OT_STATE_SOLICITADA,
        NroSolicitud,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
        createdByName:
          auth.currentUser?.displayName ||
          auth.currentUser?.email ||
          "Usuario",
      };

      const docRef = await addDoc(collection(db, "solicitudesOT"), payload);

      onCreate?.({
        id: docRef.id,
        type: "pending",
        checked: false,
        priority: "SOLICITADA",
        priorityTone: "solicitada",
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        taskTitle: form.nombreOT.trim(),
        asset: form.activoReferencia.trim(),
        duration: tipoProblemaFinal,
        schedule: departamentoFinal,
        date: form.fecha,

        nroSolicitud: NroSolicitud,
        solicitanteNombre: form.solicitanteNombre?.trim() || "",
        solicitanteFicha: form.solicitanteFicha?.trim() || "",
        lugarProblema: lugarProblemaFinal,
        tipoProblema: tipoProblemaFinal,
        descripcionOT: form.descripcionOT.trim(),
        estadoOT: OT_STATE_SOLICITADA,
        notas: form.notas.trim(),
        responsableNombre: "",
      });

      alert("✅ Solicitud OT creada correctamente.");
      onClose();
    } catch (err) {
      console.error(err);
      alert("❌ Error creando la solicitud OT");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={modal.backdrop} onClick={onClose}>
        <div style={modal.sheetLg} onClick={(e) => e.stopPropagation()}>
          <div style={modal.header}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={modal.icon}>
                <Plus size={18} />
              </div>

              <div>
                <div style={modal.title}>Nueva OT</div>
                <div style={modal.sub}>
                  Creá una nueva solicitud de orden de trabajo
                </div>
              </div>
            </div>

            <button style={modal.close} onClick={onClose} disabled={saving}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={ui.modalForm}>
            <div style={ui.twoCols}>
              <div style={ui.fieldGroup}>
                <div style={ui.label}>Nombre del solicitante</div>
                <input
                  value={form.solicitanteNombre}
                  style={ui.input}
                  readOnly
                  placeholder="Cargando..."
                />
              </div>

              <div style={ui.fieldGroup}>
                <div style={ui.label}>Ficha del solicitante</div>
                <input
                  value={form.solicitanteFicha}
                  style={ui.input}
                  readOnly
                  placeholder="Cargando..."
                />
              </div>
            </div>

            <div style={ui.twoCols}>
              <div style={ui.fieldGroup}>
                <div style={ui.label}>Fecha</div>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setField("fecha", e.target.value)}
                  style={ui.input}
                  disabled={saving}
                />
              </div>

              <div style={ui.fieldGroup}>
                <div style={ui.label}>Nombre de OT</div>
                <input
                  value={form.nombreOT}
                  onChange={(e) => setField("nombreOT", e.target.value)}
                  style={ui.input}
                  placeholder="Ej: Reparación de portón principal"
                  disabled={saving}
                />
              </div>
            </div>

            <div style={ui.fieldGroup}>
              <div style={ui.label}>Activo referencia</div>
              <input
                value={form.activoReferencia}
                onChange={(e) => setField("activoReferencia", e.target.value)}
                style={ui.input}
                placeholder="Ej: PORTÓN-01 / VEH-12 / RACK-03"
                disabled={saving}
              />
            </div>

            <div style={ui.twoCols}>
              <div style={ui.fieldGroup}>
                <div style={ui.label}>Departamento</div>
                <button
                  type="button"
                  style={ui.selectorBtn}
                  onClick={() =>
                    setPicker((prev) => ({ ...prev, departamento: true }))
                  }
                  disabled={saving}
                >
                  <span>
                    {form.departamento || "Seleccionar departamento"}
                  </span>
                  <ChevronRight size={16} />
                </button>

                {form.departamento === "Otro" && (
                  <input
                    value={form.departamentoOtro}
                    onChange={(e) =>
                      setField("departamentoOtro", e.target.value)
                    }
                    style={ui.input}
                    placeholder="Especifique departamento"
                    disabled={saving}
                  />
                )}
              </div>

              <div style={ui.fieldGroup}>
                <div style={ui.label}>Lugar del problema</div>
                <button
                  type="button"
                  style={ui.selectorBtn}
                  onClick={() =>
                    setPicker((prev) => ({ ...prev, lugarProblema: true }))
                  }
                  disabled={saving}
                >
                  <span>
                    {form.lugarProblema || "Seleccionar lugar"}
                  </span>
                  <ChevronRight size={16} />
                </button>

                {form.lugarProblema === "Otro" && (
                  <input
                    value={form.lugarProblemaOtro}
                    onChange={(e) =>
                      setField("lugarProblemaOtro", e.target.value)
                    }
                    style={ui.input}
                    placeholder="Especifique lugar"
                    disabled={saving}
                  />
                )}
              </div>
            </div>

            <div style={ui.fieldGroup}>
              <div style={ui.label}>Tipo de problema</div>
              <button
                type="button"
                style={ui.selectorBtn}
                onClick={() =>
                  setPicker((prev) => ({ ...prev, tipoProblema: true }))
                }
                disabled={saving}
              >
                <span>
                  {form.tipoProblema || "Seleccionar tipo de problema"}
                </span>
                <ChevronRight size={16} />
              </button>

              {form.tipoProblema === "Otro" && (
                <input
                  value={form.tipoProblemaOtro}
                  onChange={(e) => setField("tipoProblemaOtro", e.target.value)}
                  style={ui.input}
                  placeholder="Especifique tipo de problema"
                  disabled={saving}
                />
              )}
            </div>

            <div style={ui.fieldGroup}>
              <div style={ui.label}>Descripción de OT</div>
              <textarea
                value={form.descripcionOT}
                onChange={(e) => setField("descripcionOT", e.target.value)}
                style={ui.textarea}
                placeholder="Describa el problema o trabajo requerido"
                disabled={saving}
              />
            </div>

            <div style={ui.fieldGroup}>
              <div style={ui.label}>Notas</div>
              <textarea
                value={form.notas}
                onChange={(e) => setField("notas", e.target.value)}
                style={ui.textarea}
                placeholder="Notas adicionales"
                disabled={saving}
              />
            </div>

            <div style={modal.actions}>
              <button
                type="button"
                onClick={onClose}
                style={ui.btnGhost}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="submit"
                style={ui.btnPrimary}
                disabled={!canSave}
              >
                <Plus size={16} />
                {saving ? "Guardando..." : "Crear solicitud"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <SearchSelectModal
        open={picker.departamento}
        title="Seleccionar departamento"
        options={DEPARTAMENTOS}
        value={form.departamento}
        onSelect={(value) => {
          setField("departamento", value);
          if (value !== "Otro") setField("departamentoOtro", "");
        }}
        onClose={() =>
          setPicker((prev) => ({ ...prev, departamento: false }))
        }
      />

      <SearchSelectModal
        open={picker.lugarProblema}
        title="Seleccionar lugar del problema"
        options={LUGARES_PROBLEMA}
        value={form.lugarProblema}
        onSelect={(value) => {
          setField("lugarProblema", value);
          if (value !== "Otro") setField("lugarProblemaOtro", "");
        }}
        onClose={() =>
          setPicker((prev) => ({ ...prev, lugarProblema: false }))
        }
      />

      <SearchSelectModal
        open={picker.tipoProblema}
        title="Seleccionar tipo de problema"
        options={TIPOS_PROBLEMA}
        value={form.tipoProblema}
        onSelect={(value) => {
          setField("tipoProblema", value);
          if (value !== "Otro") setField("tipoProblemaOtro", "");
        }}
        onClose={() =>
          setPicker((prev) => ({ ...prev, tipoProblema: false }))
        }
      />
    </>
  );
}

export default function OTsPage() {
  const nav = useNavigate();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile;

  const [columns, setColumns] = useState(initialColumns);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const [openMenuId, setOpenMenuId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [pendingDragActive, setPendingDragActive] = useState(false);
  const [revisionDragActive, setRevisionDragActive] = useState(false);
  const [revisionToProcesoDragActive, setRevisionToProcesoDragActive] =
    useState(false);
  const [assignModal, setAssignModal] = useState({
    open: false,
    solicitudId: null,
    nroSolicitud: "",
    nombreOT: "",
  });
  const [confirmRevisionModal, setConfirmRevisionModal] = useState({
    open: false,
    solicitudId: null,
    nroLabel: "",
    nombreOT: "",
  });
  const [subtasksListModal, setSubtasksListModal] = useState({
    open: false,
    solicitudId: null,
    nroLabel: "",
    nombreOT: "",
  });

  const solicitudesSnapRef = useRef(null);
  const subtaskCountsRef = useRef({});

  const solicitudesQuery = useMemo(
    () =>
      query(
        collection(db, "solicitudesOT"),
        orderBy("createdAt", "desc")
      ),
    []
  );

  const applyBoardFromRefs = useCallback(() => {
    const snap = solicitudesSnapRef.current;
    if (!snap) return;

    const subtaskCountById = subtaskCountsRef.current || {};
    const pendientes = [];
    const procesoItems = [];
    const revisionItems = [];

    for (const d of snap.docs) {
      const data = d.data();
      const state = data.OTState || OT_STATE_SOLICITADA;
      const subStats = normalizeSubtaskStats(subtaskCountById[d.id]);

      if (state === OT_STATE_EN_PROCESO) {
        procesoItems.push(
          mapSnapshotToSolicitudCardItem(d, "proceso", subStats)
        );
      } else if (state === OT_STATE_REVISION) {
        revisionItems.push(
          mapSnapshotToSolicitudCardItem(d, "revision", subStats)
        );
      } else if (state === OT_STATE_FINALIZADA) {
        // Queda fuera del tablero activo (listado «OT finalizadas»).
      } else {
        pendientes.push(mapSnapshotToPendingItem(d, subStats));
      }
    }

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === "pendientes") return { ...col, items: pendientes };
        if (col.id === "proceso") return { ...col, items: procesoItems };
        if (col.id === "revision") return { ...col, items: revisionItems };
        return col;
      })
    );
    setLoadingPendientes(false);
  }, []);

  /** Total y completadas por solicitud (lectura subcolección; sirve para barra y chip). */
  const syncSubtaskCountsFromServer = useCallback(async () => {
    const snap = solicitudesSnapRef.current;
    if (!snap?.docs?.length) {
      subtaskCountsRef.current = {};
      applyBoardFromRefs();
      return;
    }

    const counts = {};
    await Promise.all(
      snap.docs.map(async (d) => {
        try {
          const subSnap = await getDocs(
            collection(db, "solicitudesOT", d.id, "subtareas")
          );
          let completed = 0;
          subSnap.forEach((docSnap) => {
            if (isSubtaskFirestoreCompleted(docSnap.data())) completed += 1;
          });
          counts[d.id] = { total: subSnap.size, completed };
        } catch (e) {
          console.warn("getDocs subtareas", d.id, e);
          counts[d.id] = { total: 0, completed: 0 };
        }
      })
    );
    subtaskCountsRef.current = counts;
    applyBoardFromRefs();
  }, [applyBoardFromRefs]);

  const refetchSolicitudesOnce = useCallback(async () => {
    try {
      setLoadingPendientes(true);
      const snap = await getDocs(solicitudesQuery);
      solicitudesSnapRef.current = snap;
      await syncSubtaskCountsFromServer();
    } catch (err) {
      console.error("Error recargando solicitudesOT:", err);
      setLoadingPendientes(false);
    }
  }, [solicitudesQuery, syncSubtaskCountsFromServer]);

  useEffect(() => {
    setLoadingPendientes(true);

    const unsubSolicitudes = onSnapshot(
      solicitudesQuery,
      (snap) => {
        solicitudesSnapRef.current = snap;
        void syncSubtaskCountsFromServer();
      },
      (err) => {
        console.error("Listener solicitudesOT:", err);
        setLoadingPendientes(false);
      }
    );

    const unsubSubtareas = onSnapshot(
      collectionGroup(db, "subtareas"),
      () => {
        void syncSubtaskCountsFromServer();
      },
      (err) => {
        console.error("Listener collectionGroup subtareas:", err);
      }
    );

    return () => {
      unsubSolicitudes();
      unsubSubtareas();
    };
  }, [solicitudesQuery, syncSubtaskCountsFromServer]);


  const selectedCount = useMemo(() => {
    return columns.reduce(
      (acc, column) =>
        acc +
        column.items.filter((item) => item.type === "pending" && item.checked)
          .length,
      0
    );
  }, [columns]);

  const totalCards = useMemo(() => {
    return columns.reduce((acc, c) => acc + c.items.length, 0);
  }, [columns]);

  const deleteCard = (itemId, columnIndex) => {
    setColumns((prev) =>
      prev.map((column, idx) =>
        idx === columnIndex
          ? {
            ...column,
            items: column.items.filter((item) => item.id !== itemId),
          }
          : column
      )
    );
  };

  const requestMovePendingToProceso = (solicitudId) => {
    if (!solicitudId?.trim()) return;
    setOpenMenuId(null);
    const pendCol = columns.find((c) => c.id === "pendientes");
    const item = pendCol?.items.find(
      (i) => i.id === solicitudId && i.type === "pending"
    );
    if (!item) return;
    setAssignModal({
      open: true,
      solicitudId,
      nroSolicitud: nroSolicitudParaOtEnTablero(item.nroSolicitud || ""),
      nombreOT: item.taskTitle || "",
    });
  };

  const closeAssignModal = () =>
    setAssignModal({
      open: false,
      solicitudId: null,
      nroSolicitud: "",
      nombreOT: "",
    });

  const openSubtasksListModal = useCallback((item) => {
    if (!item?.id) return;
    setSubtasksListModal({
      open: true,
      solicitudId: item.id,
      nroLabel: item.nroSolicitud || "",
      nombreOT: item.taskTitle || "",
    });
  }, []);

  const closeSubtasksListModal = useCallback(() => {
    setSubtasksListModal({
      open: false,
      solicitudId: null,
      nroLabel: "",
      nombreOT: "",
    });
  }, []);

  const executeMovePendingToProceso = async (solicitudId, responsable) => {
    if (!solicitudId?.trim() || !responsable?.uid) {
      throw new Error("Faltan datos para asignar el responsable.");
    }

    const prev = columnsRef.current;
    const pendCol = prev.find((c) => c.id === "pendientes");
    const item = pendCol?.items.find(
      (i) => i.id === solicitudId && i.type === "pending"
    );
    if (!item) {
      throw new Error(
        "La tarea ya no está en Pendientes. Actualizá el tablero e intentá de nuevo."
      );
    }

    setColumns((innerPrev) => {
      const pCol = innerPrev.find((c) => c.id === "pendientes");
      const still = pCol?.items.find(
        (i) => i.id === solicitudId && i.type === "pending"
      );
      if (!still) return innerPrev;
      const oti = pendingItemToProcesoSolicitudItem(still, responsable);
      return innerPrev.map((c) => {
        if (c.id === "pendientes") {
          return { ...c, items: c.items.filter((i) => i.id !== solicitudId) };
        }
        if (c.id === "proceso") {
          const merged = [oti, ...c.items];
          const byId = new Map();
          for (const it of merged) {
            if (!byId.has(it.id)) byId.set(it.id, it);
          }
          return { ...c, items: Array.from(byId.values()) };
        }
        return c;
      });
    });

    try {
      await updateDoc(doc(db, "solicitudesOT", solicitudId), {
        OTState: OT_STATE_EN_PROCESO,
        responsableUid: responsable.uid,
        responsableNombre: responsable.displayName,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert(
        "❌ No se pudo guardar «En proceso» ni el responsable. Revisá las reglas de Firestore: en solicitudesOT/update deben permitirse responsableUid y responsableNombre junto a OTState y updatedAt. Se recargará el tablero."
      );
      void refetchSolicitudesOnce();
      throw err;
    }
  };

  const moveProcesoToRevisionById = async (itemId, columnIndex) => {
    if (columnIndex !== 1) return;

    setColumns((prev) => {
      const next = prev.map((column) => ({
        ...column,
        items: [...column.items],
      }));

      const currentItems = next[columnIndex].items;
      const foundIndex = currentItems.findIndex((item) => item.id === itemId);

      if (foundIndex === -1) return prev;

      const movedItem = currentItems[foundIndex];
      currentItems.splice(foundIndex, 1);

      const transformedItem =
        movedItem.type === "solicitud"
          ? {
              ...movedItem,
              priority: "EN REVISIÓN",
              priorityTone: "revision",
              estadoOT: OT_STATE_REVISION,
            }
          : {
              ...movedItem,
              taskIcon: movedItem.progress === 100 ? "high" : "minus",
            };

      const revItems = [transformedItem, ...next[columnIndex + 1].items];
      const byId = new Map();
      for (const it of revItems) {
        if (!byId.has(it.id)) byId.set(it.id, it);
      }
      next[columnIndex + 1].items = Array.from(byId.values());
      return next;
    });

    if (!isLocalOnlyOtId(itemId)) {
      try {
        await updateDoc(doc(db, "solicitudesOT", itemId), {
          OTState: OT_STATE_REVISION,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error(err);
        alert(
          "❌ No se pudo guardar «En revisión». Se volverá a cargar el tablero."
        );
        void refetchSolicitudesOnce();
      }
    }
  };

  const moveRevisionToProcesoById = async (itemId) => {
    const COL_REV = 2;
    const COL_PRO = 1;

    setColumns((prev) => {
      const next = prev.map((column) => ({
        ...column,
        items: [...column.items],
      }));

      const revItems = next[COL_REV].items;
      const foundIndex = revItems.findIndex((item) => item.id === itemId);

      if (foundIndex === -1) return prev;

      const movedItem = revItems[foundIndex];
      if (movedItem.type !== "solicitud") return prev;

      revItems.splice(foundIndex, 1);

      const transformedItem = {
        ...movedItem,
        priority: "EN PROCESO",
        priorityTone: "proceso",
        estadoOT: OT_STATE_EN_PROCESO,
      };

      const merged = [transformedItem, ...next[COL_PRO].items];
      const byId = new Map();
      for (const it of merged) {
        if (!byId.has(it.id)) byId.set(it.id, it);
      }
      next[COL_PRO].items = Array.from(byId.values());
      return next;
    });

    if (!isLocalOnlyOtId(itemId)) {
      try {
        await updateDoc(doc(db, "solicitudesOT", itemId), {
          OTState: OT_STATE_EN_PROCESO,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error(err);
        alert(
          "❌ No se pudo guardar «En proceso». Se volverá a cargar el tablero."
        );
        void refetchSolicitudesOnce();
      }
    }
  };

  const handleDropRevisionToProceso = (itemId) => {
    if (!itemId?.trim()) return;
    const rev = columnsRef.current[2];
    const item = rev?.items.find(
      (i) => i.id === itemId && i.type === "solicitud"
    );
    if (!item) return;
    void moveRevisionToProcesoById(itemId);
  };

  const closeConfirmRevisionModal = () =>
    setConfirmRevisionModal({
      open: false,
      solicitudId: null,
      nroLabel: "",
      nombreOT: "",
    });

  const requestMoveProcesoToRevision = (itemId) => {
    if (!itemId?.trim()) return;
    const pro = columnsRef.current[1];
    const item = pro?.items.find(
      (i) => i.id === itemId && i.type === "solicitud"
    );
    if (!item || !isProcesoOtSubtasksComplete(item)) {
      alert(
        "Solo podés enviar a revisión cuando todas las subtareas estén completadas (100%)."
      );
      return;
    }
    setConfirmRevisionModal({
      open: true,
      solicitudId: itemId,
      nroLabel: item.nroSolicitud || "",
      nombreOT: item.taskTitle || "",
    });
  };

  const moveCardToNextColumn = (itemId, columnIndex) => {
    if (columnIndex >= columns.length - 1) return;

    if (columnIndex === 0) {
      requestMovePendingToProceso(itemId);
      return;
    }

    if (columnIndex === 1) {
      requestMoveProcesoToRevision(itemId);
      return;
    }

    setColumns((prev) => {
      const next = prev.map((column) => ({
        ...column,
        items: [...column.items],
      }));

      const currentItems = next[columnIndex].items;
      const foundIndex = currentItems.findIndex((item) => item.id === itemId);

      if (foundIndex === -1) return prev;

      const movedItem = currentItems[foundIndex];
      currentItems.splice(foundIndex, 1);
      next[columnIndex + 1].items.unshift(movedItem);
      return next;
    });
  };

  const createNewCard = (newItem) => {
    setColumns((prev) =>
      prev.map((column, idx) =>
        idx === 0
          ? { ...column, items: [newItem, ...column.items] }
          : column
      )
    );
  };

  const openSolicitudDetalle = (solicitudId) => {
    if (!solicitudId) return;
    nav(`/mantenimiento/ots-solicitud/${solicitudId}`);
  };

  return (
    <div style={ui.shell}>
      <div style={ui.topbar}>
        <div style={ui.brand}>
          <div style={ui.brandMark}>OT</div>

          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>AppoloDesk</div>
            <div style={ui.brandSub}>Gestión de órdenes de trabajo</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <button type="button" onClick={() => nav(-1)} style={ui.btnGhost}>
            <ArrowLeft size={16} />
            Volver
          </button>

          <button type="button" style={ui.btnGhost}>
            <ClipboardList size={16} />({selectedCount}) Seleccionado
          </button>

          <button type="button" style={ui.btnGhost} onClick={refetchSolicitudesOnce}>
            <RotateCcw size={16} />
            Actualizar
          </button>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={ui.btnPrimary}
          >
            <Plus size={16} />
            Nueva OT
          </button>
        </div>
      </div>

      <div style={ui.main}>
        <div style={ui.container}>
          <div style={ui.heroCard}>
            <div style={ui.heroAccent} />

            <div style={ui.heroGrid}>
              <div>
                <div style={ui.kicker}>Tablero operativo</div>
                <h1 style={ui.heroTitle}>Órdenes de Trabajo</h1>
                <p style={ui.heroDesc}>
                  Administrá el flujo de trabajo desde tareas pendientes hasta
                  revisión final, con una visualización clara, consistente y
                  alineada al estilo del sistema.
                </p>
              </div>

              <div style={ui.heroStats}>
                <div style={ui.heroStat}>
                  <div style={ui.heroStatIcon}>
                    <LayoutGrid size={18} />
                  </div>
                  <div>
                    <div style={ui.heroStatValue}>{totalCards}</div>
                    <div style={ui.heroStatLabel}>Tarjetas totales</div>
                  </div>
                </div>

                <div style={ui.heroStat}>
                  <div style={ui.heroStatIcon}>
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <div style={ui.heroStatValue}>{selectedCount}</div>
                    <div style={ui.heroStatLabel}>Seleccionadas</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={ui.boardWrap}>
            <div style={ui.board}>
              {columns.map((column, index) => (
                <Column
                  key={column.id}
                  column={column}
                  columnIndex={index}
                  totalColumns={columns.length}
                  onDelete={deleteCard}
                  onMoveNext={moveCardToNextColumn}
                  onOpenDetail={openSolicitudDetalle}
                  onOpenSubtasksList={openSubtasksListModal}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  loading={loadingPendientes}
                  onDropPendingToProceso={(id) => {
                    setPendingDragActive(false);
                    requestMovePendingToProceso(id);
                  }}
                  onDropProcesoToRevision={requestMoveProcesoToRevision}
                  onDropRevisionToProceso={handleDropRevisionToProceso}
                  highlightProcesoDrop={
                    pendingDragActive || revisionToProcesoDragActive
                  }
                  highlightRevisionDrop={revisionDragActive}
                  onBoardDragStart={(kind) => {
                    if (kind === "pending") setPendingDragActive(true);
                    if (kind === "procesoRevision") setRevisionDragActive(true);
                    if (kind === "revisionProceso")
                      setRevisionToProcesoDragActive(true);
                  }}
                  onBoardDragEnd={() => {
                    setPendingDragActive(false);
                    setRevisionDragActive(false);
                    setRevisionToProcesoDragActive(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <NewOTModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={createNewCard}
      />

      <AssignResponsableModal
        open={assignModal.open}
        onClose={closeAssignModal}
        solicitudId={assignModal.solicitudId}
        nroSolicitud={assignModal.nroSolicitud}
        nombreOT={assignModal.nombreOT}
        tenantId={profile?.tenantId || ""}
        company={profile?.company || ""}
        onConfirm={executeMovePendingToProceso}
      />

      <ConfirmSendToRevisionModal
        open={confirmRevisionModal.open}
        onClose={closeConfirmRevisionModal}
        nroLabel={confirmRevisionModal.nroLabel}
        nombreOT={confirmRevisionModal.nombreOT}
        onConfirm={async () => {
          const id = confirmRevisionModal.solicitudId;
          if (!id?.trim()) return;
          await moveProcesoToRevisionById(id, 1);
          closeConfirmRevisionModal();
        }}
      />

      <SubtasksListModal
        open={subtasksListModal.open}
        onClose={closeSubtasksListModal}
        solicitudId={subtasksListModal.solicitudId}
        nroLabel={subtasksListModal.nroLabel}
        nombreOT={subtasksListModal.nombreOT}
      />
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    width: "100vw",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  topbar: {
    height: 64,
    minHeight: 64,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(246,247,251,0.98) 100%)",
    backdropFilter: "blur(8px)",
    gap: 12,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 12px 24px rgba(8,159,138,0.20)",
  },
  brandTitle: {
    fontWeight: 950,
    fontSize: 14,
  },
  brandSub: {
    fontWeight: 800,
    fontSize: 12,
    color: "#64748B",
  },
  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnPrimary: {
    borderRadius: 16,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "10px 14px",
    fontWeight: 980,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 18px 32px rgba(8,159,138,0.18)",
    whiteSpace: "nowrap",
  },
  main: {
    padding: 16,
    overflow: "hidden",
    display: "grid",
    justifyItems: "center",
    alignContent: "start",
    minHeight: 0,
  },
  container: {
    width: "min(1280px, 100%)",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 16,
    height: "100%",
    minHeight: 0,
  },
  heroCard: {
    position: "relative",
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
  },
  heroAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  heroGrid: {
    padding: 18,
    display: "grid",
    gridTemplateColumns: "1.5fr 0.8fr",
    gap: 18,
    alignItems: "center",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },
  heroTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 980,
    color: "#0F172A",
  },
  heroDesc: {
    margin: "8px 0 0 0",
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.45,
    maxWidth: 760,
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  heroStat: {
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    borderRadius: 18,
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
  heroStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: 980,
    lineHeight: 1,
    color: "#0F172A",
  },
  heroStatLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },
  boardWrap: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 4,
    minHeight: 0,
  },
  board: {
    display: "flex",
    gap: 16,
    width: "max-content",
    minWidth: "100%",
    justifyContent: "center",
    alignItems: "stretch",
    height: "100%",
    minHeight: 0,
  },
  column: {
    width: 390,
    background: "linear-gradient(180deg, #EEF2F7 0%, #E9EEF6 100%)",
    borderRadius: 22,
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  columnScroll: {
    overflowY: "auto",
    display: "grid",
    gap: 14,
    paddingRight: 4,
    minHeight: 0,
    flex: 1,
    alignContent: "start",
    alignItems: "start",
  },
  columnScrollDropTarget: {
    outline: "2px dashed rgba(8, 159, 138, 0.55)",
    outlineOffset: 2,
    borderRadius: 14,
    background: "rgba(8, 159, 138, 0.07)",
    transition: "outline-color 0.15s ease, background 0.15s ease",
  },
  columnScrollDropTargetRevision: {
    outline: "2px dashed rgba(37, 99, 235, 0.5)",
    outlineOffset: 2,
    borderRadius: 14,
    background: "rgba(37, 99, 235, 0.06)",
    transition: "outline-color 0.15s ease, background 0.15s ease",
  },
  cardDraggable: {
    cursor: "grab",
  },
  columnHead: {
    background: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(15,23,42,0.06)",
    borderRadius: 18,
    padding: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexShrink: 0,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
  columnHeadLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  columnHeadRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  columnStripe: {
    width: 4,
    height: 34,
    borderRadius: 999,
  },
  columnTitle: {
    fontSize: 15,
    fontWeight: 950,
    color: "#0F172A",
  },
  columnSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },
  countPill: {
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    background: "#fff",
    border: "1px solid #E7E9F2",
    boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 950,
    color: "#0F172A",
    padding: "0 8px",
  },
  emptyColumn: {
    minHeight: 160,
    borderRadius: 18,
    border: "1px dashed #D7DEE8",
    background: "rgba(255,255,255,0.65)",
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    display: "grid",
    placeItems: "center",
    gap: 8,
    textAlign: "center",
    padding: 16,
  },
  card: {
    position: "relative",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 14px 32px rgba(15,23,42,0.08)",
    padding: 14,
    display: "grid",
    gap: 12,
    overflow: "hidden",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
  },
  cardTopAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  pendingHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },
  pendingHeadChips: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  subtasksMetaChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "#F1F5F9",
    color: "#475569",
    borderRadius: 10,
    padding: "6px 9px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.15,
    border: "1px solid #E2E8F0",
    whiteSpace: "nowrap",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    border: "2px solid #9BA2B0",
    color: "#fff",
    background: "transparent",
  },
  checkboxChecked: {
    background: ACCENT,
    border: "none",
  },
  priorityChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#FFE9EF",
    color: RED,
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  priorityChipProceso: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#FEF3C7",
    color: "#B45309",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.2,
    border: "1px solid rgba(245, 158, 11, 0.35)",
  },
  priorityChipRevision: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#DBEAFE",
    color: "#1D4ED8",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.2,
    border: "1px solid rgba(37, 99, 235, 0.25)",
  },
  pendingBodyBox: {
    background: "#FBFCFF",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    padding: 12,
    display: "grid",
    gap: 8,
  },
  cardMicroLabel: {
    fontSize: 11,
    fontWeight: 950,
    color: "#0F172A",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F172A",
    lineHeight: 1.4,
  },
  assetLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#6F7480",
    fontSize: 12,
    lineHeight: 1.4,
  },
  rowWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  softChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#F8FAFC",
    color: "#686F7D",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    border: "1px solid #E7E9F2",
  },
  softChipDanger: {
    background: "#FFF6F6",
    color: "#B42318",
    border: "1px solid rgba(239,68,68,0.18)",
  },
  cardDivider: {
    height: 1,
    background: "#E7E9F2",
  },
  cardActionsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  actionGroup: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    color: "#686F7D",
    cursor: "pointer",
    padding: 0,
    display: "grid",
    placeItems: "center",
  },
  otCode: {
    marginTop: 2,
    color: BLUE,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.1,
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  statBox: {
    background: "#FBFCFF",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    padding: 10,
    display: "grid",
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 950,
    color: "#0F172A",
    letterSpacing: 0.4,
  },
  statValueBox: {
    background: "#fff",
    borderRadius: 10,
    minHeight: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    color: "#0F172A",
    border: "1px solid #EEF1F7",
  },
  otTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#606776",
    lineHeight: 1.45,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    background: "#E4E7EE",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: ACCENT,
    transition: "width 0.2s ease",
  },
  progressMeta: {
    display: "flex",
    justifyContent: "flex-end",
    fontSize: 11,
    fontWeight: 800,
    color: "#64748B",
  },
  otFooter: {
    marginLeft: -14,
    marginRight: -14,
    marginBottom: -14,
    padding: "12px 14px",
    borderTop: "1px solid #E7E9F2",
    background: "#FBFCFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  assigneeWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#DCE2EE",
    color: "#667085",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  assigneeName: {
    fontSize: 13,
    fontWeight: 800,
    color: "#475467",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  menu: {
    position: "absolute",
    top: 34,
    right: 0,
    width: 220,
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    boxShadow: "0 16px 30px rgba(18, 24, 40, 0.14)",
    zIndex: 20,
    overflow: "hidden",
  },
  menuItem: {
    width: "100%",
    border: "none",
    background: "#fff",
    padding: "12px 14px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "#293041",
    fontWeight: 700,
  },
  modalForm: {
    padding: 14,
    display: "grid",
    gap: 14,
    background: "#fff",
  },
  fieldGroup: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontWeight: 980,
    fontSize: 13,
    color: "#0F172A",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  selectorBtn: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    minHeight: 46,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
    minHeight: 96,
    resize: "vertical",
  },

  requestCode: {
    fontSize: 13,
    fontWeight: 900,
    color: BLUE,
    letterSpacing: 0.2,
  },

  cardSubtasksProgress: {
    marginTop: 10,
    display: "grid",
    gap: 6,
  },

  cardSubtasksProgressMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 11,
    fontWeight: 800,
    color: "#64748B",
    letterSpacing: 0.02,
  },

  pendingInfoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  pendingInfoBox: {
    background: "#FBFCFF",
    border: "1px solid #E7E9F2",
    borderRadius: 14,
    padding: 10,
    display: "grid",
    gap: 4,
  },

  pendingInfoLabel: {
    fontSize: 11,
    fontWeight: 950,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  pendingInfoValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.35,
  },

  pendingDescriptionBox: {
    background: "#FBFCFF",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    padding: 12,
    display: "grid",
    gap: 8,
  },

  pendingDescription: {
    fontSize: 13,
    fontWeight: 700,
    color: "#475467",
    lineHeight: 1.45,
  },

  pendingCodeBtn: {
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    color: "#4F46E5",
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    textAlign: "left",
  },
};

const modal = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  sheet: {
    width: "min(560px, 100%)",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
  },
  header: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background: "#F3FBF9",
    border: "1px solid rgba(8,159,138,0.30)",
    display: "grid",
    placeItems: "center",
    color: ACCENT,
  },
  title: {
    fontWeight: 980,
    color: "#0F172A",
  },
  sub: {
    marginTop: 2,
    fontWeight: 850,
    color: "#64748B",
    fontSize: 12,
  },
  close: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 36,
    height: 36,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    color: "#0F172A",
  },
  actions: {
    padding: "0 14px 14px 14px",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
  },

  sheetLg: {
    width: "min(860px, 100%)",
    maxHeight: "92vh",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "auto",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
  },
};

const picker = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 10000,
  },
  sheet: {
    width: "min(520px, 100%)",
    maxHeight: "80vh",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
  },
  header: {
    padding: 14,
    borderBottom: "1px solid #EEF1F7",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "#FBFCFF",
  },
  title: {
    fontWeight: 980,
    color: "#0F172A",
  },
  close: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 36,
    height: 36,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "#0F172A",
  },
  searchWrap: {
    padding: 14,
    borderBottom: "1px solid #EEF1F7",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
  },
  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    background: "transparent",
  },
  list: {
    overflowY: "auto",
    padding: 10,
    display: "grid",
    gap: 8,
  },
  item: {
    width: "100%",
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "12px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    textAlign: "left",
  },
  itemActive: {
    border: `1px solid ${ACCENT}`,
    background: "#F3FBF9",
  },
  empty: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
    fontWeight: 800,
  },
};