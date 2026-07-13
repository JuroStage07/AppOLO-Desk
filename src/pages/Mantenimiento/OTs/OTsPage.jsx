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
  Users,
  LayoutGrid,
  ClipboardList,
  RefreshCw,
  Search,
  ChevronRight,
  Eye,
  ListChecks,
  Play,
  Timer,
  Lock,
} from "lucide-react";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { NewOTModal } from "./NewOTModal";
import { isSolicitudOtInScope } from "../../../utils/dataScope";
import { businessElapsedMs } from "../../../utils/workTime";
import useIsMobile from "../../../hooks/useIsMobile";
import {
  Brand,
  ErrorState,
  GhostButton,
  Topbar,
  useToast,
} from "../../../components/ui";
import {
  collection,
  collectionGroup,
  serverTimestamp,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { ACCENT, ACCENT_SOFT } from "../../../styles/theme";

const BLUE = "#2563EB";
const AMBER = "#F59E0B";
const RED = "#FF4D73";
const PRIORITY_HIGH = "Alta";
const PRIORITY_MED = "Media";
const PRIORITY_LOW = "Baja";

function normalizeOtPriority(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "alta") return PRIORITY_HIGH;
  if (s === "media") return PRIORITY_MED;
  if (s === "baja") return PRIORITY_LOW;
  return "";
}

function priorityToneFromLabel(label) {
  const p = normalizeOtPriority(label);
  if (p === PRIORITY_HIGH) return "high";
  if (p === PRIORITY_MED) return "med";
  if (p === PRIORITY_LOW) return "low";
  return "none";
}

function priorityColor(tone) {
  if (tone === "high") return RED;
  if (tone === "med") return AMBER;
  if (tone === "low") return "#00DDB5";
  return "#94A3B8";
}

function PriorityLevelChip({ text }) {
  const tone = priorityToneFromLabel(text);
  if (!tone || tone === "none") return null;
  const c = priorityColor(tone);
  return (
    <span
      style={{
        ...ui.priorityLevelChip,
        borderColor: `rgba(15,23,42,0.08)`,
        boxShadow: `0 10px 20px rgba(15,23,42,0.06)`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: c,
          boxShadow: `0 0 0 5px ${tone === "high"
            ? "rgba(255,77,115,0.14)"
            : tone === "med"
              ? "rgba(245,158,11,0.14)"
              : "rgba(0,221,181,0.14)"}`,
        }}
      />
      {text}
    </span>
  );
}

/** Estados persistidos en Firestore (colección solicitudesOT, campo OTState) */
const OT_STATE_SOLICITADA = "Solicitada";
const OT_STATE_EN_PROCESO = "En proceso";
const OT_STATE_REVISION = "En revisión";
const OT_STATE_FINALIZADA = "Finalizada";

/** Subcolección solicitudesOT/.../subtareas (campo `status`) */
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

/** Firestore puede guardar `fecha` como string o Timestamp; nunca renderizar el objeto en JSX. */
function fechaFieldToDisplayString(value) {
  if (value == null || value === "") return "";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString("es-AR");
  }
  if (typeof value?.seconds === "number") {
    const ms =
      value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    return new Date(ms).toLocaleDateString("es-AR");
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-AR");
  }
  return String(value);
}

/** Lista nueva (`responsablesNombres`) o texto legacy (`responsableNombre`). */
function responsablesDisplayFromFirestoreData(data) {
  if (!data || typeof data !== "object") return "";
  const names = data.responsablesNombres;
  if (Array.isArray(names) && names.length > 0) {
    return names
      .map((s) => String(s == null ? "" : s).trim())
      .filter(Boolean)
      .join(", ");
  }
  const single =
    data.responsableNombre && String(data.responsableNombre).trim();
  return single || "";
}

/** Borra subtareas y luego el documento padre (Firestore no elimina subcolecciones en cascada). */
async function deleteSolicitudOtFromFirestore(solicitudId) {
  const subSnap = await getDocs(
    collection(db, "solicitudesOT", solicitudId, "subtareas")
  );
  const BATCH_MAX = 450;
  const docs = subSnap.docs;
  for (let i = 0; i < docs.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH_MAX)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  await deleteDoc(doc(db, "solicitudesOT", solicitudId));
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
  if (t0 != null) return acc + businessElapsedMs(t0, nowMs);
  return acc;
}

function chronoWorkRunning(row) {
  return row.chronoWorkStartedAt != null;
}

function chronoQuiescent(row) {
  return !chronoWorkRunning(row);
}

/** Cierra el tramo activo y deja solo el acumulado (al marcar la subtarea completada). */
function buildSubtaskChronoFinalizeUpdate(row) {
  const now = Date.now();
  let wAcc = Number(row.chronoWorkAccumMs) || 0;
  const wStart = chronoTsToMillis(row.chronoWorkStartedAt);
  if (wStart != null) wAcc += businessElapsedMs(wStart, now);
  return {
    chronoWorkAccumMs: wAcc,
    chronoWorkStartedAt: deleteField(),
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

/** Responsables a nivel OT (al pasar a «En proceso»). */
function assigneeUidsFromSolicitudDoc(data) {
  if (!data || typeof data !== "object") return [];
  const uids = new Set();
  const raw = data.responsablesUids;
  if (Array.isArray(raw)) {
    for (const u of raw) {
      const s = String(u ?? "").trim();
      if (s) uids.add(s);
    }
  }
  const ru = String(data.responsableUid ?? "").trim();
  if (ru) uids.add(ru);
  return Array.from(uids);
}

/** Campos opcionales en subtareas si en el futuro se asignan por tarea. */
const SUBTASK_ASSIGNEE_UID_FIELDS = [
  "assignedTo",
  "assignedToUid",
  "assigneeUid",
  "asignadoUid",
  "responsableUid",
  "usuarioAsignadoUid",
];

function assigneeUidsFromSubtaskData(subData) {
  if (!subData || typeof subData !== "object") return [];
  const out = [];
  for (const f of SUBTASK_ASSIGNEE_UID_FIELDS) {
    const v = subData[f];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) out.push(s);
  }
  return out;
}

function mergeAssigneeUidsForSolicitud(data, subSnap) {
  const uids = new Set(assigneeUidsFromSolicitudDoc(data));
  const docs = subSnap?.docs ?? [];
  for (const docSnap of docs) {
    for (const u of assigneeUidsFromSubtaskData(docSnap.data())) {
      uids.add(u);
    }
  }
  return Array.from(uids);
}

function normAssigneeFilterName(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * ¿El nombre elegido coincide con alguno de los que figuran en `responsableNombre`?
 * (lista separada por comas, como al guardar responsablesNombres / responsableNombre.)
 */
function matchesResponsableNombreAssigneeFilter(responsableNombreStr, personDisplayName) {
  const needle = normAssigneeFilterName(personDisplayName);
  if (!needle) return false;
  const raw = String(responsableNombreStr ?? "").trim();
  if (!raw) return false;
  const parts = raw
    .split(/[,;]/)
    .map((p) => normAssigneeFilterName(p))
    .filter(Boolean);
  return parts.some((p) => p === needle);
}

function mapSnapshotToPendingItem(
  d,
  subtaskStats = { total: 0, completed: 0 },
  assigneeUids = []
) {
  const { total, completed } = normalizeSubtaskStats(subtaskStats);
  const data = d.data();
  const createdAtMs =
    data?.createdAt?.toMillis?.() ??
    (typeof data?.createdAt === "number" ? data.createdAt : 0) ??
    0;
  return {
    id: d.id,
    type: "pending",
    checked: false,
    subtaskCount: total,
    subtaskCompletedCount: completed,
    createdAtMs,
    priority:
      data.OTState === OT_STATE_SOLICITADA
        ? "SOLICITADA"
        : String(data.OTState || "PENDIENTE").toUpperCase(),
    priorityTone: "solicitada",
    taskTitle: data.nombreOT || "Sin nombre OT",
    asset: data.activoReferencia || "Activo no definido",
    duration: data.tipoProblema || "Sin tipo",
    schedule: data.departamento || "Sin departamento",
    date: fechaFieldToDisplayString(data.fecha),
    nroSolicitud: data.NroSolicitud || "",
    solicitanteNombre: data.solicitanteNombre || "",
    solicitanteFicha: data.solicitanteFicha || "",
    lugarProblema: data.lugarProblema || "",
    tipoProblema: data.tipoProblema || "",
    descripcionOT: data.descripcionOT || "",
    estadoOT: data.OTState || OT_STATE_SOLICITADA,
    notas: data.notas || "",
    prioridadOT: normalizeOtPriority(data.prioridadOT || data.prioridad || ""),
    responsableNombre: "",
    assigneeUids: Array.isArray(assigneeUids) ? assigneeUids : [],
  };
}

/** Misma forma visual que pendientes; columnas proceso / revisión en el tablero */
function mapSnapshotToSolicitudCardItem(
  d,
  phase,
  subtaskStats = { total: 0, completed: 0 },
  assigneeUids = []
) {
  const { total, completed } = normalizeSubtaskStats(subtaskStats);
  const data = d.data();
  const isProceso = phase === "proceso";
  const createdAtMs =
    data?.createdAt?.toMillis?.() ??
    (typeof data?.createdAt === "number" ? data.createdAt : 0) ??
    0;
  return {
    id: d.id,
    type: "solicitud",
    checked: false,
    subtaskCount: total,
    subtaskCompletedCount: completed,
    createdAtMs,
    priority: isProceso ? "EN PROCESO" : "EN REVISIÓN",
    priorityTone: isProceso ? "proceso" : "revision",
    taskTitle: data.nombreOT || "Sin nombre OT",
    asset: data.activoReferencia || "Activo no definido",
    duration: data.tipoProblema || "Sin tipo",
    schedule: data.departamento || "Sin departamento",
    date: fechaFieldToDisplayString(data.fecha),
    nroSolicitud: nroSolicitudParaOtEnTablero(data.NroSolicitud || ""),
    solicitanteNombre: data.solicitanteNombre || "",
    solicitanteFicha: data.solicitanteFicha || "",
    lugarProblema: data.lugarProblema || "",
    tipoProblema: data.tipoProblema || "",
    descripcionOT: data.descripcionOT || "",
    estadoOT: data.OTState || (isProceso ? OT_STATE_EN_PROCESO : OT_STATE_REVISION),
    notas: data.notas || "",
    prioridadOT: normalizeOtPriority(data.prioridadOT || data.prioridad || ""),
    responsableNombre: responsablesDisplayFromFirestoreData(data),
    assigneeUids: Array.isArray(assigneeUids) ? assigneeUids : [],
  };
}

function pendingItemToProcesoSolicitudItem(item, responsables) {
  const list = Array.isArray(responsables) ? responsables : [];
  const names = list
    .map((r) => String(r?.displayName || "").trim())
    .filter(Boolean);
  const joined = names.join(", ");
  const uids = list
    .map((r) => String(r?.uid || "").trim())
    .filter(Boolean);
  return {
    ...item,
    type: "solicitud",
    checked: false,
    priority: "EN PROCESO",
    priorityTone: "proceso",
    estadoOT: OT_STATE_EN_PROCESO,
    responsableNombre: joined,
    assigneeUids: uids,
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

/** Solo permiso explícito de mantenimiento (p. ej. filtro «En proceso»). */
function profileHasMantenimientoPermiso(data) {
  if (!data || typeof data !== "object") return false;
  if (data.active === false) return false;
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

/** Listado para filtro de columna En proceso: únicamente perfiles con permiso mantenimiento. */
async function fetchProfilesMantenimientoPermiso(tenantId, company) {
  const snap = await getDocs(collection(db, "profiles"));
  const rows = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!profileHasMantenimientoPermiso(data)) return;
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
  const prTone = priorityToneFromLabel(item.prioridadOT);
  const prColor = priorityColor(prTone);

  return (
    <div
      style={{
        ...ui.card,
        ...(dragEnabled ? ui.cardDraggable : {}),
        ...(prTone !== "none" ? { borderColor: `rgba(15,23,42,0.12)` } : {}),
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
      <div
        style={{
          ...ui.cardTopAccent,
          background:
            prTone !== "none"
              ? `linear-gradient(90deg, ${prColor} 0%, rgba(15,23,42,0) 100%)`
              : ui.cardTopAccent.background,
        }}
      />

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
          <PriorityLevelChip text={item.prioridadOT} />
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
            aria-label="Ver detalle"
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
            aria-label="Mover a la columna siguiente"
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
            aria-label="Eliminar"
          >
            <Trash2 size={17} />
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              style={ui.iconBtn}
              onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
              aria-label="Más opciones"
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
  const prTone = priorityToneFromLabel(item.prioridadOT);
  const prColor = priorityColor(prTone);

  return (
    <div style={ui.card}>
      <div
        style={{
          ...ui.cardTopAccent,
          background:
            prTone !== "none"
              ? `linear-gradient(90deg, ${prColor} 0%, rgba(15,23,42,0) 100%)`
              : ui.cardTopAccent.background,
        }}
      />

      <div style={ui.otCode}>{item.ot}</div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PriorityLevelChip text={item.prioridadOT} />
      </div>

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
            aria-label="Más opciones"
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
  assigneeFilterList = [],
  assigneeFilterListLoading = false,
  filterAssigneeUid = "",
  onAssigneeFilterChange,
  solicitanteFilterList = [],
  filterSolicitanteValue = "",
  onSolicitanteFilterChange,
  unfilteredCount = 0,
  isMobile = false,
  onRefreshBoard,
  /** Columna En proceso: el filtro usa `responsableNombre` (nombres asignados), no solo UID. */
  filterUsesResponsableNombre = false,
}) {
  const isProceso = column.id === "proceso";
  const isRevision = column.id === "revision";
  const isPendientes = column.id === "pendientes";
  const showSolicitanteFilter = isProceso || isRevision;
  const showProcesoHint = isProceso && highlightProcesoDrop;
  const showRevisionHint = isRevision && highlightRevisionDrop;

  const dragOverHasProcesoRevisionMime = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.some(
      (t) => t === DRAG_MIME_PROCESO_REVISION || t.includes("proceso-revision")
    );
  };

  const assigneeFilterOn = Boolean(filterAssigneeUid?.trim());
  const filterUid = filterAssigneeUid?.trim() || "";

  return (
    <div style={ui.column}>
      <div style={ui.columnHead}>
        <div style={ui.columnHeadTop}>
          <div style={ui.columnHeadLeft}>
            <div style={{ ...ui.columnStripe, background: column.stripe }} />
            <div>
              <div style={ui.columnTitle}>{column.title}</div>
              <div style={ui.columnSubtitle}>{column.subtitle}</div>
            </div>
          </div>

          <div style={ui.columnHeadRight}>
            <div
              style={ui.countPill}
              title={
                assigneeFilterOn
                  ? `${column.items.length} visibles · ${unfilteredCount} en la columna`
                  : undefined
              }
            >
              {assigneeFilterOn ? `${column.items.length}/${unfilteredCount}` : column.items.length}
            </div>
            <button
              type="button"
              style={ui.iconBtn}
              onClick={() => onRefreshBoard?.()}
              title="Actualizar tablero"
              aria-label="Actualizar tablero"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div style={{ ...ui.columnHeadFilter, ...(isMobile ? ui.mColumnHeadFilter : {}) }}>
          <label
            htmlFor={`ots-col-filter-${column.id}`}
            style={ui.columnFilterLabel}
          >
            <Users size={12} strokeWidth={2.5} style={{ verticalAlign: "middle", marginRight: 4 }} />
            {isPendientes ? "Solicitante" : "Responsable"}
          </label>
          <select
            id={`ots-col-filter-${column.id}`}
            value={filterUid}
            onChange={(e) => onAssigneeFilterChange?.(e.target.value)}
            style={{
              ...ui.columnFilterSelect,
              ...(isMobile ? ui.mColumnFilterSelect : {}),
            }}
            disabled={assigneeFilterListLoading}
          >
            <option value="">
              Todos
              {unfilteredCount > 0 ? ` (${unfilteredCount})` : ""}
            </option>
            {assigneeFilterList.map((r) => (
              <option key={r.uid} value={r.uid}>
                {r.displayName}
                {r.numeroFicha ? ` · Ficha ${r.numeroFicha}` : ""}
                {typeof r.count === "number" ? ` (${r.count})` : ""}
              </option>
            ))}
          </select>

          {showSolicitanteFilter ? (
            <>
              <label
                htmlFor={`ots-col-filter-solicitante-${column.id}`}
                style={ui.columnFilterLabel}
              >
                <Users
                  size={12}
                  strokeWidth={2.5}
                  style={{ verticalAlign: "middle", marginRight: 4 }}
                />
                Solicitante
              </label>
              <select
                id={`ots-col-filter-solicitante-${column.id}`}
                value={String(filterSolicitanteValue || "")}
                onChange={(e) => onSolicitanteFilterChange?.(e.target.value)}
                style={{
                  ...ui.columnFilterSelect,
                  ...(isMobile ? ui.mColumnFilterSelect : {}),
                }}
                disabled={assigneeFilterListLoading}
              >
                <option value="">
                  Todos
                  {unfilteredCount > 0 ? ` (${unfilteredCount})` : ""}
                </option>
                {solicitanteFilterList.map((r) => (
                  <option key={r.uid} value={r.uid}>
                    {r.displayName}
                    {r.numeroFicha ? ` · Ficha ${r.numeroFicha}` : ""}
                    {typeof r.count === "number" ? ` (${r.count})` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {filterUsesResponsableNombre ? (
            <div style={ui.columnFilterHint}>
            </div>
          ) : null}
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
              {assigneeFilterOn
                ? "No hay tarjetas con este responsable en esta columna. Probá «Todos» o otro usuario."
                : isProceso
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

function SubtasksListModal({
  open,
  onClose,
  solicitudId,
  nroLabel,
  nombreOT,
}) {
  const toast = useToast();
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
        chronoWorkStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      toast.error(
        "No se pudo iniciar el cronómetro. Revisá las reglas de Firestore."
      );
    } finally {
      setChronoBusyId(null);
    }
  };

  const handleCompleteSubtask = async (row) => {
    if (!solicitudId?.trim() || !row?.id || chronoBusyId) return;
    if (!otStateLive) return;
    if (otStateLive === OT_STATE_FINALIZADA) {
      toast.warning("La OT está finalizada. No se pueden modificar subtareas ni tiempos.");
      return;
    }
    if (isSubtaskFirestoreCompleted(row)) return;
    try {
      setChronoBusyId(row.id);
      await updateDoc(subRef(row.id), {
        status: SUBTASK_STATUS_COMPLETADA,
        updatedAt: serverTimestamp(),
        ...buildSubtaskChronoFinalizeUpdate(row),
      });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo completar la subtarea.");
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

  return (
    <div
      style={{ ...modal.backdrop, zIndex: 10050 }}
      onClick={onClose}
    >
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
            En revisión: para agregar subtareas, la OT debe estar en proceso.
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
                const quiet = chronoQuiescent(row);
                const wMs = chronoWorkElapsedMs(row, nowMs);

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
                        workRun
                      }
                      aria-label={
                        otFinalizada
                          ? "Solo lectura: OT finalizada"
                          : !otStateReady
                            ? "Cargando estado de la OT"
                            : done
                              ? "Cronómetro detenido (subtarea completada)"
                              : workRun
                                ? "Cronómetro en curso"
                                : "Iniciar cronómetro"
                      }
                      title={
                        otFinalizada
                          ? "La OT está finalizada"
                          : !otStateReady
                            ? undefined
                            : done
                              ? "Subtarea completada: cronómetro detenido"
                              : quiet
                                ? "Iniciar cronómetro (se detiene al completar la subtarea)"
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
                              : workRun
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
                            : "Subtarea completada: el tiempo de trabajo quedó registrado."}
                        </div>
                      ) : (
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
                            style={{
                              ...btnChronoSecondary,
                              fontWeight: 700,
                              color: "#64748B",
                              border: "none",
                              background: "transparent",
                              textDecoration: "underline",
                            }}
                            disabled={!!chronoBusyId || chronoLockedByOt}
                            onClick={() => void handleCompleteSubtask(row)}
                          >
                            Marcar como completada
                          </button>
                        </div>
                      )}
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

function ConfirmDeleteSolicitudModal({
  open,
  onClose,
  onConfirm,
  solicitudId,
  columnIndex,
  nroLabel,
  nombreOT,
}) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!solicitudId?.trim()) return;
    try {
      setBusy(true);
      await onConfirm(solicitudId, columnIndex);
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
        aria-labelledby="confirm-delete-title"
      >
        <div style={modal.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                ...modal.icon,
                background: "rgba(255, 71, 115, 0.08)",
                border: "1px solid rgba(255, 71, 115, 0.28)",
                color: RED,
              }}
            >
              <Trash2 size={18} strokeWidth={2.5} />
            </div>
            <div>
              <div id="confirm-delete-title" style={modal.title}>
                Eliminar solicitud
              </div>
              <div style={modal.sub}>
                Esta acción no se puede deshacer. Se borrará en el servidor
                (incluidas las subtareas).
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
            style={{
              ...ui.btnPrimary,
              borderColor: RED,
              background: RED,
              boxShadow: "0 18px 32px rgba(255,71,115,0.2)",
            }}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Eliminando…" : "Sí, eliminar"}
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
  initialPriority,
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [candidates, setCandidates] = useState([]);
  /** Orden de selección (uids). */
  const [selectedUids, setSelectedUids] = useState([]);
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState(PRIORITY_MED);

  useEffect(() => {
    if (!open) return;

    setSearch("");
    setLoadError("");
    setSelectedUids([]);
    setCandidates([]);
    setPriority(normalizeOtPriority(initialPriority) || PRIORITY_MED);

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

  const selectedRows = selectedUids
    .map((uid) => candidates.find((c) => c.uid === uid))
    .filter(Boolean);

  const toggleUid = (uid) => {
    setSelectedUids((prev) => {
      const i = prev.indexOf(uid);
      if (i >= 0) return prev.filter((id) => id !== uid);
      return [...prev, uid];
    });
  };

  const handleConfirm = async () => {
    if (!solicitudId || selectedRows.length === 0) return;
    const responsables = selectedRows.map((c) => ({
      uid: c.uid,
      displayName: c.displayName,
    }));
    try {
      setSaving(true);
      await onConfirm(solicitudId, responsables, priority);
      onClose();
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "No se pudo completar la acción. Intentá de nuevo.";
      toast.error(msg);
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
                Responsables de la OT
              </div>
              <div style={modal.sub}>
                Elegí uno o más personas que ejecutan esta orden. Tocá cada fila
                para marcar o desmarcar. Solo aparecen perfiles con permiso de
                mantenimiento, admin o dev.
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
          <div style={ui.priorityPicker}>
            <div style={ui.priorityPickerLabel}>Prioridad</div>
            <div style={ui.priorityPickerRow}>
              <button
                type="button"
                onClick={() => setPriority(PRIORITY_HIGH)}
                disabled={saving}
                style={{
                  ...ui.priorityBtn,
                  ...(priority === PRIORITY_HIGH ? ui.priorityBtnActiveHigh : {}),
                }}
              >
                Alta
              </button>
              <button
                type="button"
                onClick={() => setPriority(PRIORITY_MED)}
                disabled={saving}
                style={{
                  ...ui.priorityBtn,
                  ...(priority === PRIORITY_MED ? ui.priorityBtnActiveMed : {}),
                }}
              >
                Media
              </button>
              <button
                type="button"
                onClick={() => setPriority(PRIORITY_LOW)}
                disabled={saving}
                style={{
                  ...ui.priorityBtn,
                  ...(priority === PRIORITY_LOW ? ui.priorityBtnActiveLow : {}),
                }}
              >
                Baja
              </button>
            </div>
          </div>
          {selectedRows.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span
                style={{ fontSize: 11, fontWeight: 800, color: "#64748B" }}
              >
                Seleccionados ({selectedRows.length}):
              </span>
              {selectedRows.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  title="Quitar"
                  onClick={() => toggleUid(c.uid)}
                  style={{
                    border: `1px solid ${ACCENT}`,
                    background: ACCENT_SOFT,
                    color: "#0F172A",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {c.displayName}
                  <X size={14} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          ) : null}
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
              const active = selectedUids.includes(c.uid);
              return (
                <button
                  key={c.uid}
                  type="button"
                  style={{
                    ...picker.item,
                    ...(active ? picker.itemActive : {}),
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                  onClick={() => toggleUid(c.uid)}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      textAlign: "left",
                      minWidth: 0,
                    }}
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
                  </div>
                  {active ? (
                    <CircleCheck
                      size={22}
                      strokeWidth={2.5}
                      color={ACCENT}
                      style={{ flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: "2px solid #E2E8F0",
                        flexShrink: 0,
                      }}
                    />
                  )}
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
            disabled={selectedRows.length === 0 || saving}
          >
            {saving ? "Guardando…" : "Confirmar y mover a en proceso"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OTsPage() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile;
  const loading = authCtx?.loading;

  const [columns, setColumns] = useState(initialColumns);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const [openMenuId, setOpenMenuId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [boardError, setBoardError] = useState("");
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
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    open: false,
    solicitudId: null,
    columnIndex: 0,
    nroLabel: "",
    nombreOT: "",
  });
  const [subtasksListModal, setSubtasksListModal] = useState({
    open: false,
    solicitudId: null,
    nroLabel: "",
    nombreOT: "",
  });
  const [otCreatedSuccess, setOtCreatedSuccess] = useState({
    open: false,
    nroSolicitud: "",
    nombreOT: "",
  });
  /** Filtro por columna: UID de responsable (vacío = todos en esa columna). */
  const [filterAssigneeByColumnId, setFilterAssigneeByColumnId] = useState({
    pendientes: "",
    proceso: "",
    revision: "",
  });
  /** Filtro adicional por columna: solicitante (se usa en «En proceso» y «En revisión»). */
  const [filterSolicitanteByColumnId, setFilterSolicitanteByColumnId] = useState({
    proceso: "",
    revision: "",
  });
  const [assigneeFilterList, setAssigneeFilterList] = useState([]);
  /** Solo `permisos.mantenimiento`: opciones del filtro en columna En proceso. */
  const [assigneeFilterListProceso, setAssigneeFilterListProceso] = useState(
    []
  );
  const [assigneeFilterListLoading, setAssigneeFilterListLoading] =
    useState(false);

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
      if (!isSolicitudOtInScope(data, profile?.tenantId, profile?.company, profile?.bodegaId)) continue;
      const state = data.OTState || OT_STATE_SOLICITADA;
      const rawSub = subtaskCountById[d.id];
      const subStats = normalizeSubtaskStats(rawSub);
      const assigneeUids = Array.isArray(rawSub?.assigneeUids)
        ? rawSub.assigneeUids
        : assigneeUidsFromSolicitudDoc(data);

      if (state === OT_STATE_EN_PROCESO) {
        procesoItems.push(
          mapSnapshotToSolicitudCardItem(d, "proceso", subStats, assigneeUids)
        );
      } else if (state === OT_STATE_REVISION) {
        revisionItems.push(
          mapSnapshotToSolicitudCardItem(d, "revision", subStats, assigneeUids)
        );
      } else if (state === OT_STATE_FINALIZADA) {
        // Queda fuera del tablero activo (listado «OT finalizadas»).
      } else {
        pendientes.push(mapSnapshotToPendingItem(d, subStats, assigneeUids));
      }
    }

    // Pendientes: más nuevas arriba (por createdAt del doc)
    pendientes.sort((a, b) => (b?.createdAtMs || 0) - (a?.createdAtMs || 0));
    // Proceso: más nuevas arriba (por createdAt del doc)
    procesoItems.sort((a, b) => (b?.createdAtMs || 0) - (a?.createdAtMs || 0));

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === "pendientes") return { ...col, items: pendientes };
        if (col.id === "proceso") return { ...col, items: procesoItems };
        if (col.id === "revision") return { ...col, items: revisionItems };
        return col;
      })
    );
    setLoadingPendientes(false);
  }, [profile?.tenantId, profile?.company, profile?.bodegaId]);

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
        const data = d.data();
        if (!isSolicitudOtInScope(data, profile?.tenantId, profile?.company, profile?.bodegaId)) {
          return;
        }
        try {
          const subSnap = await getDocs(
            collection(db, "solicitudesOT", d.id, "subtareas")
          );
          let completed = 0;
          subSnap.forEach((docSnap) => {
            if (isSubtaskFirestoreCompleted(docSnap.data())) completed += 1;
          });
          counts[d.id] = {
            total: subSnap.size,
            completed,
            assigneeUids: mergeAssigneeUidsForSolicitud(data, subSnap),
          };
        } catch (e) {
          console.warn("getDocs subtareas", d.id, e);
          counts[d.id] = {
            total: 0,
            completed: 0,
            assigneeUids: assigneeUidsFromSolicitudDoc(data),
          };
        }
      })
    );
    subtaskCountsRef.current = counts;
    applyBoardFromRefs();
  }, [applyBoardFromRefs, profile?.tenantId, profile?.company, profile?.bodegaId]);

  const refetchSolicitudesOnce = useCallback(async () => {
    try {
      setLoadingPendientes(true);
      setBoardError("");
      const snap = await getDocs(solicitudesQuery);
      solicitudesSnapRef.current = snap;
      await syncSubtaskCountsFromServer();
    } catch (err) {
      console.error("Error recargando solicitudesOT:", err);
      setBoardError("No se pudieron cargar las órdenes de trabajo. Revisá tu conexión o los permisos.");
      setLoadingPendientes(false);
    }
  }, [solicitudesQuery, syncSubtaskCountsFromServer]);

  useEffect(() => {
    if (loading) return;
    setLoadingPendientes(true);

    const unsubSolicitudes = onSnapshot(
      solicitudesQuery,
      (snap) => {
        solicitudesSnapRef.current = snap;
        setBoardError("");
        void syncSubtaskCountsFromServer();
      },
      (err) => {
        console.error("Listener solicitudesOT:", err);
        setBoardError("No se pudieron cargar las órdenes de trabajo. Revisá tu conexión o los permisos.");
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
  }, [loading, solicitudesQuery, syncSubtaskCountsFromServer]);

  useEffect(() => {
    if (loading || !profile) return;
    let cancelled = false;
    (async () => {
      setAssigneeFilterListLoading(true);
      try {
        const [rows, rowsProceso] = await Promise.all([
          fetchMantenimientoResponsables(profile.tenantId, profile.company),
          fetchProfilesMantenimientoPermiso(profile.tenantId, profile.company),
        ]);
        if (!cancelled) {
          setAssigneeFilterList(rows);
          setAssigneeFilterListProceso(rowsProceso);
        }
      } catch (e) {
        console.error("fetch listas filtro OTs:", e);
        if (!cancelled) {
          setAssigneeFilterList([]);
          setAssigneeFilterListProceso([]);
        }
      } finally {
        if (!cancelled) setAssigneeFilterListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, profile?.tenantId, profile?.company]);

  /** Si el filtro de proceso apuntaba a alguien que ya no está en la lista restringida, se limpia. */
  useEffect(() => {
    const uid = (filterAssigneeByColumnId.proceso ?? "").trim();
    if (!uid) return;
    if (!assigneeFilterListProceso.some((r) => r.uid === uid)) {
      setFilterAssigneeByColumnId((p) => ({ ...p, proceso: "" }));
    }
  }, [assigneeFilterListProceso, filterAssigneeByColumnId.proceso]);

  /** Proceso: opciones del filtro de responsables = solo UIDs realmente asignados en esa columna. */
  const responsableFilterListProcesoAsignados = useMemo(() => {
    const col = columns.find((c) => c.id === "proceso");
    const items = Array.isArray(col?.items) ? col.items : [];
    const counts = new Map();
    for (const it of items) {
      const uids = Array.isArray(it?.assigneeUids) ? it.assigneeUids : [];
      for (const raw of uids) {
        const uid = String(raw || "").trim();
        if (!uid) continue;
        counts.set(uid, (counts.get(uid) || 0) + 1);
      }
    }
    const out = [];
    for (const [uid, count] of counts.entries()) {
      const p = assigneeFilterListProceso.find((r) => r.uid === uid);
      out.push({
        uid,
        displayName: p?.displayName || uid,
        numeroFicha: p?.numeroFicha || "",
        count,
      });
    }
    out.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", {
        sensitivity: "base",
      })
    );
    return out;
  }, [columns, assigneeFilterListProceso]);

  // Si el filtro de proceso apunta a alguien que ya no está asignado, se limpia.
  useEffect(() => {
    const uid = String(filterAssigneeByColumnId.proceso || "").trim();
    if (!uid) return;
    if (!responsableFilterListProcesoAsignados.some((r) => r.uid === uid)) {
      setFilterAssigneeByColumnId((p) => ({ ...p, proceso: "" }));
    }
  }, [responsableFilterListProcesoAsignados, filterAssigneeByColumnId.proceso]);

  /** Revisión: opciones del filtro de responsables = solo UIDs realmente asignados en esa columna. */
  const responsableFilterListRevisionAsignados = useMemo(() => {
    const col = columns.find((c) => c.id === "revision");
    const items = Array.isArray(col?.items) ? col.items : [];
    const counts = new Map();
    for (const it of items) {
      const uids = Array.isArray(it?.assigneeUids) ? it.assigneeUids : [];
      for (const raw of uids) {
        const uid = String(raw || "").trim();
        if (!uid) continue;
        counts.set(uid, (counts.get(uid) || 0) + 1);
      }
    }

    const lookup =
      [...(assigneeFilterListProceso || []), ...(assigneeFilterList || [])] || [];

    const out = [];
    for (const [uid, count] of counts.entries()) {
      const p = lookup.find((r) => r.uid === uid);
      out.push({
        uid,
        displayName: p?.displayName || uid,
        numeroFicha: p?.numeroFicha || "",
        count,
      });
    }
    out.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", {
        sensitivity: "base",
      })
    );
    return out;
  }, [columns, assigneeFilterListProceso, assigneeFilterList]);

  // Si el filtro de revisión apunta a alguien que ya no está asignado, se limpia.
  useEffect(() => {
    const uid = String(filterAssigneeByColumnId.revision || "").trim();
    if (!uid) return;
    if (!responsableFilterListRevisionAsignados.some((r) => r.uid === uid)) {
      setFilterAssigneeByColumnId((p) => ({ ...p, revision: "" }));
    }
  }, [responsableFilterListRevisionAsignados, filterAssigneeByColumnId.revision]);

  /** Proceso: opciones del filtro = solicitantes presentes en esa columna. */
  const solicitanteFilterListProceso = useMemo(() => {
    const col = columns.find((c) => c.id === "proceso");
    const items = Array.isArray(col?.items) ? col.items : [];
    const map = new Map();
    for (const it of items) {
      const ficha = String(it?.solicitanteFicha || "").trim();
      const nombre = String(it?.solicitanteNombre || "").trim();
      const key = ficha || nombre;
      if (!key) continue;
      if (map.has(key)) {
        const prev = map.get(key);
        map.set(key, { ...prev, count: (prev?.count || 0) + 1 });
        continue;
      }
      map.set(key, {
        uid: key,
        displayName: nombre || (ficha ? `Ficha ${ficha}` : key),
        numeroFicha: ficha,
        count: 1,
      });
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", {
        sensitivity: "base",
      })
    );
    return rows;
  }, [columns]);

  // Si el filtro de solicitante de proceso apunta a alguien que ya no está, se limpia.
  useEffect(() => {
    const v = String(filterSolicitanteByColumnId.proceso || "").trim();
    if (!v) return;
    if (!solicitanteFilterListProceso.some((r) => r.uid === v)) {
      setFilterSolicitanteByColumnId((p) => ({ ...p, proceso: "" }));
    }
  }, [solicitanteFilterListProceso, filterSolicitanteByColumnId.proceso]);

  /** Revisión: opciones del filtro = solicitantes presentes en esa columna. */
  const solicitanteFilterListRevision = useMemo(() => {
    const col = columns.find((c) => c.id === "revision");
    const items = Array.isArray(col?.items) ? col.items : [];
    const map = new Map();
    for (const it of items) {
      const ficha = String(it?.solicitanteFicha || "").trim();
      const nombre = String(it?.solicitanteNombre || "").trim();
      const key = ficha || nombre;
      if (!key) continue;
      if (map.has(key)) {
        const prev = map.get(key);
        map.set(key, { ...prev, count: (prev?.count || 0) + 1 });
        continue;
      }
      map.set(key, {
        uid: key,
        displayName: nombre || (ficha ? `Ficha ${ficha}` : key),
        numeroFicha: ficha,
        count: 1,
      });
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", {
        sensitivity: "base",
      })
    );
    return rows;
  }, [columns]);

  // Si el filtro de solicitante de revisión apunta a alguien que ya no está, se limpia.
  useEffect(() => {
    const v = String(filterSolicitanteByColumnId.revision || "").trim();
    if (!v) return;
    if (!solicitanteFilterListRevision.some((r) => r.uid === v)) {
      setFilterSolicitanteByColumnId((p) => ({ ...p, revision: "" }));
    }
  }, [solicitanteFilterListRevision, filterSolicitanteByColumnId.revision]);

  /** Pendientes: opciones del filtro = solicitantes presentes en esa columna. */
  const solicitanteFilterListPendientes = useMemo(() => {
    const col = columns.find((c) => c.id === "pendientes");
    const items = Array.isArray(col?.items) ? col.items : [];
    const map = new Map();
    for (const it of items) {
      const ficha = String(it?.solicitanteFicha || "").trim();
      const nombre = String(it?.solicitanteNombre || "").trim();
      const key = ficha || nombre;
      if (!key) continue;
      if (map.has(key)) {
        const prev = map.get(key);
        map.set(key, { ...prev, count: (prev?.count || 0) + 1 });
        continue;
      }
      map.set(key, {
        uid: key,
        displayName: nombre || (ficha ? `Ficha ${ficha}` : key),
        numeroFicha: ficha,
        count: 1,
      });
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", {
        sensitivity: "base",
      })
    );
    return rows;
  }, [columns]);

  // Si el filtro de pendientes apunta a alguien que ya no está, se limpia.
  useEffect(() => {
    const v = String(filterAssigneeByColumnId.pendientes || "").trim();
    if (!v) return;
    if (!solicitanteFilterListPendientes.some((r) => r.uid === v)) {
      setFilterAssigneeByColumnId((p) => ({ ...p, pendientes: "" }));
    }
  }, [solicitanteFilterListPendientes, filterAssigneeByColumnId.pendientes]);

  const displayColumns = useMemo(() => {
    return columns.map((col) => {
      const uid = (filterAssigneeByColumnId[col.id] ?? "").trim();
      // Pendientes: filtro por solicitante
      if (col.id === "pendientes") {
        if (!uid) return col;
        return {
          ...col,
          items: col.items.filter((item) => {
            const ficha = String(item?.solicitanteFicha || "").trim();
            const nombre = String(item?.solicitanteNombre || "").trim();
            const key = ficha || nombre;
            return key === uid;
          }),
        };
      }
      // Proceso: 1) filtro por responsable (si aplica) 2) filtro por solicitante (si aplica)
      if (col.id === "proceso") {
        const solicitanteKey = String(filterSolicitanteByColumnId.proceso || "").trim();
        const itemsBase = !uid
          ? col.items
          : col.items.filter((item) => {
              const uids = item.assigneeUids;
              return Array.isArray(uids) && uids.includes(uid);
            });
        const itemsFinal = !solicitanteKey
          ? itemsBase
          : itemsBase.filter((item) => {
              const ficha = String(item?.solicitanteFicha || "").trim();
              const nombre = String(item?.solicitanteNombre || "").trim();
              const key = ficha || nombre;
              return key === solicitanteKey;
            });
        return { ...col, items: itemsFinal };
      }

      // Revisión: 1) filtro por responsable (si aplica) 2) filtro por solicitante (si aplica)
      if (col.id === "revision") {
        const solicitanteKey = String(filterSolicitanteByColumnId.revision || "").trim();
        const itemsBase = !uid
          ? col.items
          : col.items.filter((item) => {
              const uids = item.assigneeUids;
              return Array.isArray(uids) && uids.includes(uid);
            });
        const itemsFinal = !solicitanteKey
          ? itemsBase
          : itemsBase.filter((item) => {
              const ficha = String(item?.solicitanteFicha || "").trim();
              const nombre = String(item?.solicitanteNombre || "").trim();
              const key = ficha || nombre;
              return key === solicitanteKey;
            });
        return { ...col, items: itemsFinal };
      }

      // Otras columnas: filtro por UID responsable/asignado
      if (!uid) return col;
      return {
        ...col,
        items: col.items.filter((item) => {
          const uids = item.assigneeUids;
          return Array.isArray(uids) && uids.includes(uid);
        }),
      };
    });
  }, [columns, filterAssigneeByColumnId, filterSolicitanteByColumnId, assigneeFilterListProceso]);

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

  const closeDeleteConfirmModal = useCallback(() => {
    setDeleteConfirmModal({
      open: false,
      solicitudId: null,
      columnIndex: 0,
      nroLabel: "",
      nombreOT: "",
    });
  }, []);

  const executeDeleteConfirm = useCallback(
    async (solicitudId, columnIndex) => {
      if (!solicitudId?.trim()) return;

      const removeFromBoard = () => {
        setColumns((prev) =>
          prev.map((column, idx) =>
            idx === columnIndex
              ? {
                  ...column,
                  items: column.items.filter((item) => item.id !== solicitudId),
                }
              : column
          )
        );
      };

      if (isLocalOnlyOtId(solicitudId)) {
        removeFromBoard();
        closeDeleteConfirmModal();
        return;
      }

      try {
        await deleteSolicitudOtFromFirestore(solicitudId);
        removeFromBoard();
        closeDeleteConfirmModal();
        toast.success("Solicitud OT eliminada.");
      } catch (err) {
        console.error("Error eliminando solicitudOT:", err);
        toast.error(
          "No se pudo eliminar. Revisá permisos y las reglas de Firestore para solicitudesOT y subtareas."
        );
      }
    },
    [closeDeleteConfirmModal, toast]
  );

  const deleteCard = useCallback((itemId, columnIndex) => {
    if (!itemId?.trim()) return;
    setOpenMenuId(null);
    const col = columnsRef.current[columnIndex];
    const item = col?.items.find((i) => i.id === itemId);
    setDeleteConfirmModal({
      open: true,
      solicitudId: itemId,
      columnIndex,
      nroLabel: item?.nroSolicitud || item?.ot || "",
      nombreOT: item?.taskTitle || "",
    });
  }, []);

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

  const executeMovePendingToProceso = async (solicitudId, responsables, prioridadOT) => {
    const raw = Array.isArray(responsables) ? responsables : [];
    const cleaned = raw
      .filter((r) => r?.uid)
      .map((r) => ({
        uid: r.uid,
        displayName: String(r.displayName || "").trim() || r.uid,
      }));
    const uids = cleaned.map((r) => r.uid);
    const nombres = cleaned.map((r) => r.displayName);
    if (!solicitudId?.trim() || uids.length === 0) {
      throw new Error("Elegí al menos un responsable.");
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
      const oti = pendingItemToProcesoSolicitudItem(still, cleaned);
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
        responsableUid: uids[0],
        responsableNombre: nombres.join(", "),
        responsablesUids: uids,
        responsablesNombres: nombres,
        prioridadOT: normalizeOtPriority(prioridadOT) || PRIORITY_MED,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      toast.error(
        "No se pudo guardar «En proceso» ni los responsables/prioridad. Revisá las reglas de Firestore. Se recargará el tablero."
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
        toast.error(
          "No se pudo guardar «En revisión». Se volverá a cargar el tablero."
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
        toast.error(
          "No se pudo guardar «En proceso». Se volverá a cargar el tablero."
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
      toast.warning(
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

  const handleNewOTCreated = (newItem) => {
    createNewCard(newItem);
    setOtCreatedSuccess({
      open: true,
      nroSolicitud: newItem.nroSolicitud || "",
      nombreOT: newItem.taskTitle || "",
    });
  };

  const openSolicitudDetalle = (solicitudId) => {
    if (!solicitudId) return;
    nav(`/mantenimiento/ots-solicitud/${solicitudId}`);
  };

  return (
    <div style={{ ...ui.shell, ...(isMobile ? ui.mShell : {}) }}>
      <Topbar>
        <Brand
          icon={Wrench}
          title="Órdenes de Trabajo"
          subtitle="Gestión de OTs"
          onClick={() => nav("/mantenimiento")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mantenimiento")}>
            Inicio
          </GhostButton>
          <GhostButton icon={RotateCcw} onClick={refetchSolicitudesOnce}>
            Actualizar
          </GhostButton>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{ ...ui.btnPrimary, ...(isMobile ? ui.mBtnPrimary : {}) }}
          >
            <Plus size={16} />
            Nueva OT
          </button>
        </Topbar.Right>
      </Topbar>

      <div style={{ ...ui.main, ...(isMobile ? ui.mMain : {}) }}>
        <div style={{ ...ui.container, ...(isMobile ? ui.mContainer : {}) }}>
          <div style={ui.heroCard}>
            <div style={ui.heroAccent} />

            <div style={{ ...ui.heroGrid, ...(isMobile ? ui.mHeroGrid : {}) }}>
              <div>
                <div style={ui.kicker}>Tablero operativo</div>
                <h1 style={ui.heroTitle}>Órdenes de Trabajo</h1>
                <p style={ui.heroDesc}>
                  Administrá el flujo de trabajo desde tareas pendientes hasta
                  revisión final, con una visualización clara, consistente y
                  alineada al estilo del sistema.
                </p>
              </div>

              <div style={{ ...ui.heroStats, ...(isMobile ? ui.mHeroStats : {}) }}>
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

          {boardError ? (
            <ErrorState
              description={boardError}
              onRetry={refetchSolicitudesOnce}
              style={{ marginBottom: 14 }}
            />
          ) : null}

          <div style={{ ...ui.boardWrap, ...(isMobile ? ui.mBoardWrap : {}) }}>
            <div style={ui.board}>
              {displayColumns.map((column, index) => (
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
                  assigneeFilterList={
                    column.id === "pendientes"
                      ? solicitanteFilterListPendientes
                      : column.id === "proceso"
                        ? responsableFilterListProcesoAsignados
                        : column.id === "revision"
                          ? responsableFilterListRevisionAsignados
                        : assigneeFilterList
                  }
                  assigneeFilterListLoading={assigneeFilterListLoading}
                  filterAssigneeUid={filterAssigneeByColumnId[column.id] ?? ""}
                  onAssigneeFilterChange={(uid) =>
                    setFilterAssigneeByColumnId((p) => ({
                      ...p,
                      [column.id]: uid,
                    }))
                  }
                  solicitanteFilterList={
                    column.id === "proceso"
                      ? solicitanteFilterListProceso
                      : column.id === "revision"
                        ? solicitanteFilterListRevision
                        : []
                  }
                  filterSolicitanteValue={
                    column.id === "proceso"
                      ? filterSolicitanteByColumnId.proceso
                      : column.id === "revision"
                        ? filterSolicitanteByColumnId.revision
                        : ""
                  }
                  onSolicitanteFilterChange={(v) =>
                    setFilterSolicitanteByColumnId((p) => ({
                      ...p,
                      [column.id]: v,
                    }))
                  }
                  unfilteredCount={columns[index].items.length}
                  isMobile={isMobile}
                  onRefreshBoard={refetchSolicitudesOnce}
                  filterUsesResponsableNombre={column.id === "proceso"}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <NewOTModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleNewOTCreated}
        suppressSuccessAlert
      />

      {otCreatedSuccess.open ? (
        <div
          style={otSuccessModal.backdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ots-created-success-title"
        >
          <div
            style={otSuccessModal.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={otSuccessModal.iconWrap}>
              <CircleCheck size={36} strokeWidth={2.25} color={ACCENT} />
            </div>
            <div id="ots-created-success-title" style={otSuccessModal.title}>
              Solicitud creada
            </div>
            <p style={otSuccessModal.body}>
              La orden de trabajo se registró correctamente.
              {otCreatedSuccess.nroSolicitud ? (
                <>
                  {" "}
                  <span style={{ fontWeight: 800, color: "#0F172A" }}>
                    {otCreatedSuccess.nroSolicitud}
                  </span>
                </>
              ) : null}
              {otCreatedSuccess.nombreOT ? (
                <>
                  <br />
                  <span style={{ fontWeight: 700 }}>{otCreatedSuccess.nombreOT}</span>
                </>
              ) : null}
            </p>
            <button
              type="button"
              style={otSuccessModal.okBtn}
              onClick={() =>
                setOtCreatedSuccess({
                  open: false,
                  nroSolicitud: "",
                  nombreOT: "",
                })
              }
            >
              Aceptar
            </button>
          </div>
        </div>
      ) : null}

      <AssignResponsableModal
        open={assignModal.open}
        onClose={closeAssignModal}
        solicitudId={assignModal.solicitudId}
        nroSolicitud={assignModal.nroSolicitud}
        nombreOT={assignModal.nombreOT}
        tenantId={profile?.tenantId || ""}
        company={profile?.company || ""}
        initialPriority={
          columns.find((c) => c.id === "pendientes")?.items?.find(
            (i) => i?.id === assignModal.solicitudId
          )?.prioridadOT || ""
        }
        onConfirm={executeMovePendingToProceso}
      />

      <ConfirmDeleteSolicitudModal
        open={deleteConfirmModal.open}
        onClose={closeDeleteConfirmModal}
        solicitudId={deleteConfirmModal.solicitudId}
        columnIndex={deleteConfirmModal.columnIndex}
        nroLabel={deleteConfirmModal.nroLabel}
        nombreOT={deleteConfirmModal.nombreOT}
        onConfirm={executeDeleteConfirm}
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
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    flexShrink: 0,
    position: "sticky",
    top: 0,
    zIndex: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
    gap: 12,
    flexWrap: "wrap",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
    flexShrink: 0,
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
    flexDirection: "column",
    gap: 10,
    marginBottom: 12,
    flexShrink: 0,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
  columnHeadTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },
  columnHeadFilter: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },
  columnFilterLabel: {
    fontSize: 11,
    fontWeight: 850,
    color: "#64748B",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  columnFilterSelect: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    fontWeight: 800,
    color: "#0F172A",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  columnFilterHint: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    lineHeight: 1.35,
    marginTop: 2,
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
  priorityLevelChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    background: "#fff",
    border: "1px solid #E7E9F2",
    fontSize: 11,
    fontWeight: 950,
    color: "#0F172A",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  },
  priorityPicker: {
    marginTop: 6,
    padding: 10,
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#fff",
    display: "grid",
    gap: 8,
  },
  priorityPickerLabel: {
    fontSize: 11,
    fontWeight: 950,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priorityPickerRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  priorityBtn: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    fontFamily: "inherit",
  },
  priorityBtnActiveHigh: {
    borderColor: "rgba(255,77,115,0.40)",
    background: "rgba(255,77,115,0.12)",
  },
  priorityBtnActiveMed: {
    borderColor: "rgba(245,158,11,0.45)",
    background: "rgba(245,158,11,0.14)",
  },
  priorityBtnActiveLow: {
    borderColor: "rgba(0,221,181,0.55)",
    background: "rgba(0,221,181,0.14)",
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

  // mobile overrides
  mShell: { minHeight: "100dvh" },
  mTopbar: {
    height: "auto",
    minHeight: 56,
    padding: "10px 12px",
    alignItems: "flex-start",
    flexDirection: "column",
  },
  mTopbarRight: { width: "100%", justifyContent: "flex-start", gap: 8 },
  mBtnGhost: { width: "100%", justifyContent: "center", minHeight: 40 },
  mBtnPrimary: { width: "100%", justifyContent: "center", minHeight: 42 },
  mMain: { padding: 10 },
  mContainer: { gap: 10 },
  mHeroGrid: { gridTemplateColumns: "1fr", padding: 12, gap: 12 },
  mHeroStats: { gridTemplateColumns: "1fr", gap: 8 },
  mColumnHeadFilter: { gap: 8 },
  mColumnFilterSelect: { fontSize: 13, minHeight: 40 },
  mBoardWrap: { paddingBottom: 8 },
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

/** Modal de éxito al crear OT desde el tablero (misma línea visual que Servicios generales). */
const otSuccessModal = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 10050,
    background: "rgba(15,23,42,0.5)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    boxSizing: "border-box",
  },
  sheet: {
    width: "min(400px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 48px rgba(15,23,42,0.2)",
    padding: "28px 24px 24px",
    display: "grid",
    gap: 14,
    justifyItems: "center",
    textAlign: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  body: {
    margin: 0,
    fontSize: 14,
    fontWeight: 650,
    color: "#64748B",
    lineHeight: 1.5,
    maxWidth: 320,
  },
  okBtn: {
    marginTop: 4,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    borderRadius: 14,
    padding: "12px 28px",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    minWidth: 160,
    boxShadow: "0 12px 24px rgba(8,159,138,0.25)",
  },
};