import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

import { auth, db } from "../../../firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

const ACCENT = "#089F8A";
const BLUE = "#2563EB";
const AMBER = "#F59E0B";
const RED = "#FF4D73";

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

function PriorityChip({ text }) {
  return (
    <div style={ui.priorityChip}>
      <AlertTriangle size={13} />
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
  openMenuId,
  setOpenMenuId,
}) {
  
  const menuOpen = openMenuId === item.id;

  return (
    <div style={ui.card}>
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

        <PriorityChip text={item.priority || "PENDIENTE"} />
      </div>

      {!!item.nroSolicitud && (
        <div style={ui.requestCode}>{item.nroSolicitud}</div>
      )}

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
            style={ui.iconBtn}
            onClick={() => onMoveNext(item.id, columnIndex)}
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
                canMove={columnIndex < totalColumns - 1}
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
  openMenuId,
  setOpenMenuId,
  loading = false,
}) {
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

      <div style={ui.columnScroll}>
        {loading ? (
          <div style={ui.emptyColumn}>
            <ClipboardList size={20} />
            <div>Cargando solicitudes...</div>
          </div>
        ) : column.items.length === 0 ? (
          <div style={ui.emptyColumn}>
            <ClipboardList size={20} />
            <div>No hay elementos en esta columna.</div>
          </div>
        ) : (
          column.items.map((item) =>
            item.type === "pending" ? (
              <PendingCard
                key={item.id}
                item={item}
                columnIndex={columnIndex}
                totalColumns={totalColumns}
                onDelete={onDelete}
                onMoveNext={onMoveNext}
                onOpenDetail={onOpenDetail}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
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

        OTState: "Solicitada",
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
        estadoOT: "Solicitada",
        notas: form.notas.trim(),
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
  const [columns, setColumns] = useState(initialColumns);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPendientes, setLoadingPendientes] = useState(false);

  const loadSolicitudesOT = async () => {
    try {
      setLoadingPendientes(true);

      const q = query(
        collection(db, "solicitudesOT"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);

      const pendientes = snap.docs.map((d) => {
        const data = d.data();

        return {
          id: d.id,
          type: "pending",
          checked: false,
          priority:
            data.OTState === "Solicitada"
              ? "SOLICITADA"
              : String(data.OTState || "PENDIENTE").toUpperCase(),
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
          estadoOT: data.OTState || "Solicitada",
          notas: data.notas || "",
        };
      });

      setColumns((prev) =>
        prev.map((col) =>
          col.id === "pendientes" ? { ...col, items: pendientes } : col
        )
      );
    } catch (err) {
      console.error("Error cargando solicitudesOT:", err);
    } finally {
      setLoadingPendientes(false);
    }
  };

  useEffect(() => {
    loadSolicitudesOT();
  }, []);


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

  const moveCardToNextColumn = (itemId, columnIndex) => {
    if (columnIndex >= columns.length - 1) return;

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

      let transformedItem = movedItem;

      if (movedItem.type === "pending") {
        transformedItem = {
          id: `ot-${Date.now()}`,
          type: "ot",
          ot: `OT - ${Math.floor(Math.random() * 900 + 100)}- PS`,
          activo: 1,
          tarea: 1,
          taskIcon: "high",
          taskTitle: movedItem.taskTitle,
          progress: 0,
          duration: movedItem.duration,
          date: movedItem.date,
          assignee: "SIN ASIGNAR",
          avatar: "",
        };
      } else if (columnIndex === 1) {
        transformedItem = {
          ...movedItem,
          taskIcon: movedItem.progress === 100 ? "high" : "minus",
        };
      }

      next[columnIndex + 1].items.unshift(transformedItem);
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

          <button type="button" style={ui.btnGhost} onClick={loadSolicitudesOT}>
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
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  loading={column.id === "pendientes" ? loadingPendientes : false}
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