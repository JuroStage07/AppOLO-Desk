import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Paperclip,
  AlertTriangle,
  FileText,
  UserCircle2,
  Wrench,
  MapPin,
  Hash,
  Plus,
  Pencil,
  Trash2,
  CircleCheck,
  Clock3,
  Timer,
} from "lucide-react";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import { db, auth } from "../../../firebase";
import { OT_STATE_FINALIZADA } from "./OTsFinalizadasPage";

const ACCENT = "#089F8A";
const OT_STATE_EN_PROCESO = "En proceso";
const OT_STATE_REVISION = "En revisión";
const BLUE = "#2563EB";
const RED = "#FF4D73";

function formatDate(value) {
  if (!value) return "—";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleDateString("es-AR");
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("es-AR");
  } catch {
    return String(value);
  }
}

function chronoTsToMillis(ts) {
  if (ts == null) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
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

/** Alineado a subtareas en Firestore (misma lógica que el tablero). */
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

function subtaskCreatedAtMillis(s) {
  return chronoTsToMillis(s?.createdAt);
}

function subtaskStatusLabel(s) {
  if (isSubtaskFirestoreCompleted(s)) return "Completada";
  const raw = s?.status ?? s?.estado;
  if (raw == null || String(raw).trim() === "") return "Pendiente";
  return String(raw);
}

/**
 * Totales de cronómetro y promedio de intervalo entre altas consecutivas de subtareas.
 */
function buildSubtasksChronoSummary(subtasks, nowMs) {
  const ordered = [...subtasks].sort(
    (a, b) =>
      (subtaskCreatedAtMillis(a) ?? 0) - (subtaskCreatedAtMillis(b) ?? 0)
  );

  let totalWork = 0;
  let totalDead = 0;
  const perId = {};

  for (const row of ordered) {
    const wMs = chronoWorkElapsedMs(row, nowMs);
    const dMs = chronoDeadElapsedMs(row, nowMs);
    totalWork += wMs;
    totalDead += dMs;
    if (row?.id) {
      perId[row.id] = {
        wMs,
        dMs,
        workRun: chronoWorkRunning(row),
        deadRun: chronoDeadRunning(row),
      };
    }
  }

  let avgBetweenTasksMs = null;
  if (ordered.length >= 2) {
    const stamps = ordered.map((s) => subtaskCreatedAtMillis(s));
    if (stamps.every((t) => t != null && !Number.isNaN(t))) {
      let gapSum = 0;
      for (let i = 1; i < stamps.length; i++) {
        gapSum += stamps[i] - stamps[i - 1];
      }
      avgBetweenTasksMs = gapSum / (stamps.length - 1);
    }
  }

  return { totalWork, totalDead, avgBetweenTasksMs, perId, ordered, nowMs };
}

function normalizeTask(docId, data) {
  const attachments = Array.isArray(data?.adjuntos)
    ? data.adjuntos
    : Array.isArray(data?.attachments)
      ? data.attachments
      : [];

  return {
    id: docId,
    code: data?.NroSolicitud || `SOL-${docId}`,
    estado: data?.OTState || "Solicitada",
    solicitanteNombre: data?.solicitanteNombre || "",
    solicitanteFicha: data?.solicitanteFicha || "",
    responsableMantenimiento: data?.responsableNombre || "",
    responsable:
      data?.responsableNombre ||
      data?.solicitanteNombre ||
      data?.createdByName ||
      "Sin responsable",
    ficha: data?.solicitanteFicha || "—",
    note: data?.notas || "",
    createdAt: data?.createdAt || null,
    fechaSolicitud: data?.fecha || null,
    nombreOT: data?.nombreOT || "Sin nombre OT",
    activo: data?.activoReferencia || "Activo no informado",
    departamento: data?.departamento || "Sin departamento",
    lugarProblema: data?.lugarProblema || "Sin lugar",
    tipoProblema: data?.tipoProblema || "Sin tipo",
    descripcionOT: data?.descripcionOT || "Sin descripción",
    attachments,
    tasks: [
      {
        id: "principal",
        title: data?.nombreOT || "Sin nombre OT",
        asset: data?.activoReferencia || "Activo no informado",
        path: data?.lugarProblema || "Ubicación no informada",
        taskType: data?.tipoProblema || "—",
        class1: data?.departamento || "—",
        class2: data?.OTState || "—",
        requestNo: data?.NroSolicitud || "—",
        scheduledDate: data?.fecha || null,
        attachmentsCount: attachments.length,
        priority:
          data?.OTState === "Solicitada" ? "Pendiente" : data?.OTState || "—",
        description: data?.descripcionOT || "",
        expanded: true,
      },
    ],
  };
}

function SoftChip({ icon, text, tone = "default" }) {
  return (
    <div
      style={{
        ...ui.softChip,
        ...(tone === "accent" ? ui.softChipAccent : {}),
        ...(tone === "danger" ? ui.softChipDanger : {}),
      }}
    >
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

function DetailRow({ label, value }) {
  return (
    <div style={ui.detailRow}>
      <div style={ui.detailLabel}>{label}</div>
      <div style={ui.detailValue}>{value || "—"}</div>
    </div>
  );
}

export default function OTsDetallePage() {
  const nav = useNavigate();
  const { id } = useParams();

  //subtareas
  const [detailView, setDetailView] = useState("tarea");
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [savingSubtask, setSavingSubtask] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [subtaskForm, setSubtaskForm] = useState({
    title: "",
    description: "",
  });
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState("");

  const [ot, setOt] = useState(null);
  const [note, setNote] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [finalizingOt, setFinalizingOt] = useState(false);
  const [chronoTick, setChronoTick] = useState(0);

  useEffect(() => {
    const loadOT = async () => {
      try {
        setLoading(true);
        setError("");

        const ref = doc(db, "solicitudesOT", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("No se encontró la OT.");
          setOt(null);
          return;
        }

        const normalized = normalizeTask(snap.id, snap.data()) || null;

        const subtareasRef = collection(db, "solicitudesOT", id, "subtareas");
        const subtareasSnap = await getDocs(query(subtareasRef, orderBy("createdAt", "asc")));

        const subtareasData = subtareasSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setOt(normalized);
        setNote(normalized?.note || "");
        setTasks(normalized?.tasks || []);
        setSubtasks(subtareasData);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la OT.");
      } finally {
        setLoading(false);
      }
    };

    if (id) loadOT();
  }, [id]);

  const anySubtaskChronoRunning = useMemo(
    () =>
      subtasks.some(
        (s) => chronoWorkRunning(s) || chronoDeadRunning(s)
      ),
    [subtasks]
  );

  useEffect(() => {
    if (subtasks.length === 0 || !anySubtaskChronoRunning) return;
    const timerId = window.setInterval(
      () => setChronoTick((n) => n + 1),
      1000
    );
    return () => window.clearInterval(timerId);
  }, [subtasks.length, anySubtaskChronoRunning]);

  const totalAttachments = useMemo(
    () => tasks.reduce((acc, t) => acc + Number(t.attachmentsCount || 0), 0),
    [tasks]
  );

  const chronoSummary = useMemo(() => {
    const nowMs = Date.now();
    return buildSubtasksChronoSummary(subtasks, nowMs);
  }, [subtasks, chronoTick]);

  const toggleTask = (taskId) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, expanded: !task.expanded } : task
      )
    );
  };

  const handleSave = () => {
    console.log("Guardar cambios", { id, note });
    // Acá después podés hacer updateDoc(...)
  };

  const readOnlyOt = ot?.estado === OT_STATE_FINALIZADA;
  const canAddSubtasks = ot?.estado === OT_STATE_EN_PROCESO;
  const canFinalizeOt = ot?.estado === OT_STATE_REVISION;

  const handleFinalizeOt = async () => {
    if (!id?.trim()) return;
    if (ot?.estado !== OT_STATE_REVISION) {
      window.alert(
        "Solo podés finalizar la OT cuando está en revisión. Antes no se puede cerrar: tiene que pasar por revisión."
      );
      return;
    }
    const ok = window.confirm(
      "¿Finalizar esta OT? Quedará cerrada (Finalizada): no se podrán editar tiempos ni subtareas."
    );
    if (!ok) return;
    try {
      setFinalizingOt(true);
      const ref = doc(db, "solicitudesOT", id);
      await updateDoc(ref, {
        OTState: OT_STATE_FINALIZADA,
        updatedAt: serverTimestamp(),
      });
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const normalized = normalizeTask(snap.id, snap.data());
        setOt(normalized);
        setTasks(normalized?.tasks || []);
      }
      const subtareasRef = collection(db, "solicitudesOT", id, "subtareas");
      const subtareasSnap = await getDocs(
        query(subtareasRef, orderBy("createdAt", "asc"))
      );
      setSubtasks(
        subtareasSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    } catch (err) {
      console.error(err);
      window.alert(
        "No se pudo finalizar la OT. Revisá que en Firestore exista el estado «Finalizada» en validOTState y que las reglas permitan actualizar OTState."
      );
    } finally {
      setFinalizingOt(false);
    }
  };

  const handleOpenSubtaskModal = (subtask = null) => {
    if (!subtask && !canAddSubtasks) {
      window.alert(
        "Solo podés agregar subtareas mientras la OT está en proceso."
      );
      return;
    }
    if (subtask) {
      setEditingSubtaskId(subtask.id);
      setSubtaskForm({
        title: subtask.title || "",
        description: subtask.description || "",
      });
    } else {
      setEditingSubtaskId(null);
      setSubtaskForm({ title: "", description: "" });
    }

    setShowSubtaskModal(true);
  };

  const handleCloseSubtaskModal = () => {
    if (savingSubtask) return;
    setShowSubtaskModal(false);
    setEditingSubtaskId(null);
    setSubtaskForm({ title: "", description: "" });
  };

  const handleCreateSubtask = async () => {
    if (readOnlyOt) {
      alert("La OT está finalizada. Solo lectura.");
      return;
    }
    if (!editingSubtaskId && !canAddSubtasks) {
      alert("Solo podés agregar subtareas mientras la OT está en proceso.");
      return;
    }

    const title = subtaskForm.title.trim();
    const description = subtaskForm.description.trim();

    if (!title) {
      alert("El título de la subtarea es obligatorio.");
      return;
    }

    if (!auth.currentUser?.uid) {
      alert("No hay usuario autenticado.");
      return;
    }

    try {
      setSavingSubtask(true);

      const subtareasRef = collection(db, "solicitudesOT", id, "subtareas");

      if (editingSubtaskId) {
        const subtaskRef = doc(db, "solicitudesOT", id, "subtareas", editingSubtaskId);

        await updateDoc(subtaskRef, {
          title,
          description,
          updatedAt: serverTimestamp(),
        });

        setSubtasks((prev) =>
          prev.map((item) =>
            item.id === editingSubtaskId
              ? {
                ...item,
                title,
                description,
                updatedAt: new Date(),
              }
              : item
          )
        );
      } else {
        const payload = {
          title,
          description,
          status: "Pendiente",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: auth.currentUser.uid,
          createdByName: auth.currentUser.displayName || "Usuario",
        };

        const docRef = await addDoc(subtareasRef, payload);

        setSubtasks((prev) => [
          ...prev,
          {
            id: docRef.id,
            title,
            description,
            status: "Pendiente",
            createdBy: auth.currentUser.uid,
            createdByName: auth.currentUser.displayName || "Usuario",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }

      setShowSubtaskModal(false);
      setEditingSubtaskId(null);
      setSubtaskForm({ title: "", description: "" });
      setDetailView("subtareas");
    } catch (err) {
      console.error(err);
      alert(
        editingSubtaskId
          ? "No se pudo actualizar la subtarea."
          : "No se pudo guardar la subtarea."
      );
    } finally {
      setSavingSubtask(false);
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    if (!subtaskId) return;
    if (readOnlyOt) {
      alert("La OT está finalizada. Solo lectura.");
      return;
    }

    const confirmed = window.confirm("¿Eliminar esta subtarea?");
    if (!confirmed) return;

    try {
      setDeletingSubtaskId(subtaskId);

      const subtaskRef = doc(db, "solicitudesOT", id, "subtareas", subtaskId);
      await deleteDoc(subtaskRef);

      setSubtasks((prev) => prev.filter((item) => item.id !== subtaskId));
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar la subtarea.");
    } finally {
      setDeletingSubtaskId("");
    }
  };

  if (loading) {
    return (
      <div style={ui.centerState}>
        <div style={ui.stateCard}>Cargando OT...</div>
      </div>
    );
  }

  if (error || !ot) {
    return (
      <div style={ui.centerState}>
        <div style={ui.stateCard}>{error || "No hay información disponible."}</div>
      </div>
    );
  }


  return (
    <div style={ui.shell}>
      <div style={ui.topbar}>
        <div style={ui.brand}>
          <div style={ui.brandMark}>OT</div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>AppoloDesk</div>
            <div style={ui.brandSub}>Detalle de orden de trabajo</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <button type="button" onClick={() => nav(-1)} style={ui.btnGhost}>
            <ArrowLeft size={16} />
            Volver
          </button>

          <button
            type="button"
            onClick={handleSave}
            style={{
              ...ui.btnPrimary,
              ...(readOnlyOt ? ui.btnPrimaryDisabled : {}),
            }}
            disabled={readOnlyOt}
          >
            <Save size={16} />
            Guardar
          </button>
        </div>
      </div>

      <div style={ui.main}>
        <div style={ui.container}>
          <div style={ui.hero}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Orden de trabajo</div>
                <span style={ui.badge}>{ot.estado}</span>
              </div>

              <h1 style={ui.title}>Resumen de la OT</h1>
              <p style={ui.subtitle}>
                Información real de la solicitud y de la tarea generada.
              </p>
            </div>

            <div style={ui.heroNote}>
              <div style={ui.heroNoteTitle}>Código</div>
              <div style={ui.heroNoteCode}>{ot.code}</div>
              <div style={ui.heroNoteText}>
                ID interno: <b>{ot.id}</b>
              </div>
            </div>
          </div>

          <div style={ui.mainCard}>
            <div style={ui.topAccent} />

            <div style={ui.cardHead}>
              <div style={ui.personWrap}>
                <div style={ui.avatarFallback}>
                  <UserCircle2 size={24} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={ui.personNameRow}>
                    <div style={ui.personName}>{ot.responsable}</div>
                  </div>
                  {ot.responsableMantenimiento && ot.solicitanteNombre ? (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748B",
                      }}
                    >
                      Solicitó: {ot.solicitanteNombre}
                      {ot.solicitanteFicha
                        ? ` · Ficha ${ot.solicitanteFicha}`
                        : ""}
                    </div>
                  ) : null}

                  <div style={ui.metaRow}>
                    <SoftChip
                      icon={<CalendarDays size={13} />}
                      text={`Creada: ${formatDate(ot.createdAt)}`}
                    />
                    <SoftChip
                      icon={<CalendarDays size={13} />}
                      text={`Fecha solicitud: ${formatDate(ot.fechaSolicitud)}`}
                    />
                  </div>
                </div>
              </div>

              <div style={ui.statusBox}>
                <div style={ui.statusDot} />
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={ui.statusTitle}>{ot.estado}</div>
                  <div style={ui.statusSub}>Estado actual de la OT</div>
                </div>
              </div>
            </div>

            <div style={ui.noteCard}>
              <div style={ui.noteHeader}>
                <div style={ui.noteTitleWrap}>
                  <div style={ui.noteIcon}>
                    <FileText size={16} />
                  </div>
                  <div>
                    <div style={ui.noteTitle}>Nota</div>
                    <div style={ui.noteSub}>Observaciones generales</div>
                  </div>
                </div>
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  ...ui.noteInput,
                  ...(readOnlyOt ? ui.noteInputReadOnly : {}),
                }}
                rows={4}
                readOnly={readOnlyOt}
              />
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionTitle}>Tarea generada</div>
            <div style={ui.sectionText}>
              Se muestra solamente la información útil y real.
            </div>
          </div>

          <div style={ui.sectionToolbar}>
            <div style={ui.toolbarTabs}>
              <button
                type="button"
                onClick={() => setDetailView("tarea")}
                style={{
                  ...ui.summaryMini,
                  ...(detailView === "tarea" ? ui.summaryMiniActive : {}),
                }}
              >
                <span style={ui.summaryMiniLabel}>Total tareas</span>
                <span style={ui.summaryMiniValue}>{tasks.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailView("subtareas")}
                style={{
                  ...ui.summaryMini,
                  ...(detailView === "subtareas" ? ui.summaryMiniActive : {}),
                }}
              >
                <span style={ui.summaryMiniLabel}>Subtareas</span>
                <span style={ui.summaryMiniValue}>{subtasks.length}</span>
              </button>
            </div>
          </div>

          <div style={ui.tasksWrap}>
            {detailView === "tarea" ? (
              tasks.map((task) => (
                <div key={task.id} style={ui.taskCard}>
                  <div style={ui.topAccent} />

                  <div style={ui.taskAssetBlock}>
                    <div style={ui.assetLeft}>
                      <div style={ui.assetIcon}>
                        <Wrench size={18} />
                      </div>

                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={ui.assetTitle}>{task.asset}</div>
                        <div style={ui.assetPath}>
                          <MapPin size={12} style={{ marginRight: 6 }} />
                          {task.path}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={ui.taskPanel}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTask(task.id)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && toggleTask(task.id)
                    }
                  >
                    <div style={ui.taskPanelMain}>
                      <div style={ui.taskMainTitle}>{task.title}</div>

                      {task.expanded && (
                        <div style={ui.detailsGrid}>
                          <DetailRow label="Nro. solicitud" value={task.requestNo} />
                          <DetailRow label="Descripción" value={task.description} />
                          <DetailRow label="Tipo de problema" value={task.taskType} />
                          <DetailRow label="Departamento" value={task.class1} />
                          <DetailRow label="Estado" value={task.class2} />
                          <DetailRow
                            label="Fecha solicitud"
                            value={formatDate(task.scheduledDate)}
                          />
                          {readOnlyOt && subtasks.length > 0 ? (
                            <div style={ui.chronoSummaryBlock}>
                              <div style={ui.chronoSummaryHead}>
                                <Clock3 size={16} color={ACCENT} />
                                <span>Tiempos (todas las subtareas)</span>
                              </div>
                              <DetailRow
                                label="Total trabajo"
                                value={formatChronoMs(chronoSummary.totalWork)}
                              />
                              <DetailRow
                                label="Total tiempo muerto"
                                value={formatChronoMs(chronoSummary.totalDead)}
                              />
                              <DetailRow
                                label="Promedio entre subtareas"
                                value={
                                  chronoSummary.avgBetweenTasksMs != null
                                    ? formatChronoMs(
                                        chronoSummary.avgBetweenTasksMs
                                      )
                                    : "—"
                                }
                              />
                              <div style={ui.chronoSummaryHint}>
                                El promedio entre subtareas es el intervalo
                                promedio entre la fecha en que se dio de alta cada
                                subtarea y la siguiente (en orden de creación).
                                {subtasks.length < 2
                                  ? " Hace falta al menos dos subtareas para calcularlo."
                                  : ""}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div style={ui.chevronWrap}>
                      {task.expanded ? (
                        <ChevronDown size={20} />
                      ) : (
                        <ChevronRight size={20} />
                      )}
                    </div>
                  </div>

                  <div style={ui.taskFooter}>
                    <div style={ui.footerLeft}>
                      <div style={ui.footerItem}>
                        <Hash size={14} />
                        <span>ADJUNTOS</span>
                        <b>{task.attachmentsCount}</b>
                      </div>
                    </div>

                    <PriorityChip text={task.priority} />
                  </div>
                </div>
              ))
            ) : (
              <div style={ui.subtasksCard}>
                <div style={ui.topAccent} />

                <div style={ui.subtasksHeader}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={ui.subtasksTitle}>Lista de subtareas</div>
                    {subtasks.length > 0 ? (
                      <div style={ui.subtasksChronoLegend}>
                        <Timer size={13} color="#64748B" />
                        Trabajo y tiempo muerto por subtarea (como en gestión de
                        OT).
                      </div>
                    ) : null}
                  </div>

                  <div style={ui.subtasksHeaderRight}>
                    <div style={ui.subtasksCount}>Total: {subtasks.length}</div>

                    <button
                      type="button"
                      style={{
                        ...ui.addMiniCircleBtn,
                        ...(!canAddSubtasks || readOnlyOt
                          ? ui.addMiniCircleBtnDisabled
                          : {}),
                      }}
                      onClick={() => handleOpenSubtaskModal()}
                      title={
                        readOnlyOt
                          ? "OT finalizada · solo lectura"
                          : canAddSubtasks
                            ? "Agregar subtarea"
                            : "Solo podés agregar subtareas con la OT en proceso"
                      }
                      disabled={readOnlyOt || !canAddSubtasks}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {subtasks.length ? (
                  <div style={ui.subtasksList}>
                    {subtasks.map((subtask, index) => {
                      const cm =
                        subtask?.id && chronoSummary.perId[subtask.id]
                          ? chronoSummary.perId[subtask.id]
                          : {
                              wMs: chronoWorkElapsedMs(
                                subtask,
                                chronoSummary.nowMs
                              ),
                              dMs: chronoDeadElapsedMs(
                                subtask,
                                chronoSummary.nowMs
                              ),
                              workRun: chronoWorkRunning(subtask),
                              deadRun: chronoDeadRunning(subtask),
                            };
                      const stLabel = subtaskStatusLabel(subtask);
                      return (
                      <div key={subtask?.id || index} style={ui.subtaskItem}>
                        <div style={ui.subtaskBullet}>{index + 1}</div>

                        <div style={ui.subtaskContent}>
                          <div style={ui.subtaskTopRow}>
                            <div style={ui.subtaskName}>
                              {subtask?.title || subtask?.nombre || `Subtarea ${index + 1}`}
                            </div>

                            <div style={ui.subtaskActions}>
                              <button
                                type="button"
                                style={{
                                  ...ui.subtaskIconBtn,
                                  ...(readOnlyOt ? ui.subtaskIconBtnDisabled : {}),
                                }}
                                onClick={() => handleOpenSubtaskModal(subtask)}
                                title={
                                  readOnlyOt
                                    ? "OT finalizada · solo lectura"
                                    : "Editar subtarea"
                                }
                                disabled={readOnlyOt}
                              >
                                <Pencil size={15} />
                              </button>

                              <button
                                type="button"
                                style={{
                                  ...ui.subtaskIconBtn,
                                  ...(readOnlyOt || deletingSubtaskId === subtask.id
                                    ? ui.subtaskIconBtnDisabled
                                    : {}),
                                }}
                                onClick={() => handleDeleteSubtask(subtask.id)}
                                title={
                                  readOnlyOt
                                    ? "OT finalizada · solo lectura"
                                    : "Eliminar subtarea"
                                }
                                disabled={readOnlyOt || deletingSubtaskId === subtask.id}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          <div style={ui.subtaskMeta}>
                            {subtask?.description || subtask?.descripcion || "Sin descripción"}
                          </div>

                          <div style={ui.subtaskChronoRow}>
                            <span style={ui.subtaskChronoPill}>
                              Estado: <b>{stLabel}</b>
                            </span>
                            <span style={ui.subtaskChronoMetric}>
                              Trabajo:{" "}
                              <b style={{ color: cm.workRun ? ACCENT : "#334155" }}>
                                {formatChronoMs(cm.wMs)}
                              </b>
                              {cm.workRun ? (
                                <span style={ui.subtaskChronoLive}> · en curso</span>
                              ) : null}
                            </span>
                            <span style={ui.subtaskChronoMetric}>
                              T. muerto:{" "}
                              <b
                                style={{
                                  color: cm.deadRun ? "#B45309" : "#334155",
                                }}
                              >
                                {formatChronoMs(cm.dMs)}
                              </b>
                              {cm.deadRun ? (
                                <span style={ui.subtaskChronoLiveDead}>
                                  {" "}
                                  · en curso
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div style={ui.emptySubtasksBox}>
                    <div style={ui.emptySubtasksText}>
                      No hay subtareas aun asignadas, presiona + para comenzar a añadir.
                    </div>

                    <button
                      type="button"
                      style={{
                        ...ui.addCircleBtn,
                        ...(!canAddSubtasks || readOnlyOt
                          ? ui.addCircleBtnDisabled
                          : {}),
                      }}
                      onClick={() => handleOpenSubtaskModal()}
                      title={
                        readOnlyOt
                          ? "OT finalizada · solo lectura"
                          : canAddSubtasks
                            ? "Agregar subtarea"
                            : "Solo podés agregar subtareas con la OT en proceso"
                      }
                      disabled={readOnlyOt || !canAddSubtasks}
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={ui.bottomSummary}>
            <div style={ui.bottomSummaryMain}>
              <div style={ui.summaryItem}>
                <div style={ui.summaryIcon}>
                  <Paperclip size={16} />
                </div>
                <div>
                  <div style={ui.summaryLabel}>Adjuntos totales</div>
                  <div style={ui.summaryValue}>{totalAttachments}</div>
                </div>
              </div>

              <div style={ui.summaryItem}>
                <div style={ui.summaryIcon}>
                  <UserCircle2 size={16} />
                </div>
                <div>
                  <div style={ui.summaryLabel}>Solicitante</div>
                  <div style={ui.summaryValue}>
                    {ot.solicitanteNombre || ot.responsable} ·{" "}
                    {ot.solicitanteFicha || ot.ficha}
                  </div>
                </div>
              </div>

              <div style={ui.summaryItem}>
                <div style={ui.summaryIcon}>
                  <CalendarDays size={16} />
                </div>
                <div>
                  <div style={ui.summaryLabel}>Fecha solicitud</div>
                  <div style={ui.summaryValue}>
                    {formatDate(ot.fechaSolicitud)}
                  </div>
                </div>
              </div>
            </div>

            <div style={ui.bottomSummaryAction}>
              <button
                type="button"
                style={{
                  ...ui.btnFinalizeOt,
                  ...(canFinalizeOt && !readOnlyOt ? {} : ui.btnFinalizeOtMuted),
                }}
                disabled={finalizingOt || readOnlyOt}
                onClick={() => {
                  if (finalizingOt || readOnlyOt) return;
                  if (!canFinalizeOt) {
                    window.alert(
                      "Solo podés finalizar la OT cuando está en revisión. Antes no se puede cerrar: tiene que pasar por revisión."
                    );
                    return;
                  }
                  void handleFinalizeOt();
                }}
                title={
                  readOnlyOt
                    ? "OT ya finalizada"
                    : canFinalizeOt
                      ? "Cerrar la OT (solo lectura después)"
                      : "Disponible cuando la OT esté en revisión"
                }
              >
                <CircleCheck size={18} strokeWidth={2.25} />
                {finalizingOt ? "Finalizando…" : "Finalizar OT"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showSubtaskModal && (
        <div style={ui.modalOverlay} onClick={handleCloseSubtaskModal}>
          <div
            style={ui.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <div>
                <div style={ui.modalTitle}>
                  {editingSubtaskId ? "Editar subtarea" : "Agregar subtarea"}
                </div>
                <div style={ui.modalSubtitle}>
                  {editingSubtaskId
                    ? "Actualizá la información de la subtarea."
                    : "Completá la información básica de la subtarea."}
                </div>
              </div>

              <button
                type="button"
                style={ui.modalCloseBtn}
                onClick={handleCloseSubtaskModal}
              >
                ×
              </button>
            </div>

            <div style={ui.modalBody}>
              <div style={ui.fieldGroup}>
                <label style={ui.fieldLabel}>Título</label>
                <input
                  type="text"
                  value={subtaskForm.title}
                  onChange={(e) =>
                    setSubtaskForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  style={ui.fieldInput}
                  placeholder="Ej. Revisar tablero eléctrico"
                />
              </div>

              <div style={ui.fieldGroup}>
                <label style={ui.fieldLabel}>Descripción</label>
                <textarea
                  value={subtaskForm.description}
                  onChange={(e) =>
                    setSubtaskForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  style={ui.fieldTextarea}
                  rows={5}
                  placeholder="Detalle de la subtarea"
                />
              </div>
            </div>

            <div style={ui.modalFooter}>
              <button
                type="button"
                style={ui.btnGhost}
                onClick={handleCloseSubtaskModal}
                disabled={savingSubtask}
              >
                Cancelar
              </button>

              <button
                type="button"
                style={ui.btnPrimary}
                onClick={handleCreateSubtask}
                disabled={savingSubtask}
              >
                {savingSubtask
                  ? "Guardando..."
                  : editingSubtaskId
                    ? "Guardar cambios"
                    : "Guardar subtarea"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  centerState: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#F6F7FB",
    padding: 24,
  },
  stateCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 20,
    fontWeight: 800,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
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
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,247,251,0.98) 100%)",
    gap: 12,
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
  },
  brandTitle: { fontWeight: 950, fontSize: 14 },
  brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },
  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnPrimary: {
    borderRadius: 16,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "10px 16px",
    fontWeight: 980,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  main: {
    overflow: "auto",
    padding: 16,
    display: "grid",
    placeItems: "start center",
  },
  container: {
    width: "min(1220px, 100%)",
    display: "grid",
    gap: 16,
    paddingBottom: 18,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.45fr 0.75fr",
    gap: 14,
    alignItems: "stretch",
  },
  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
  },
  kicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  subtitle: {
    margin: 0,
    color: "#64748B",
    fontWeight: 800,
    lineHeight: 1.45,
    maxWidth: 780,
  },
  heroNote: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    alignContent: "start",
    gap: 8,
  },
  heroNoteTitle: { fontWeight: 980, color: "#0F172A" },
  heroNoteCode: {
    fontSize: 24,
    fontWeight: 980,
    color: BLUE,
    lineHeight: 1.1,
  },
  heroNoteText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.4,
  },
  mainCard: {
    width: "100%",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    position: "relative",
    padding: 16,
    display: "grid",
    gap: 14,
  },
  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    paddingTop: 4,
  },
  personWrap: { display: "flex", alignItems: "center", gap: 14 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: "#F1F5F9",
    color: "#64748B",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  personNameRow: { display: "flex", alignItems: "center", gap: 8 },
  personName: {
    fontWeight: 900,
    fontSize: 16,
    color: "#475467",
    letterSpacing: 0.2,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#fff",
    minWidth: 220,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
  },
  statusTitle: { fontWeight: 980, color: "#0F172A" },
  statusSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },
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
    border: "1px solid #E7E9F2",
  },
  softChipAccent: {
    background: "#F1FBF8",
    color: ACCENT,
    border: "1px solid rgba(8,159,138,0.25)",
  },
  softChipDanger: {
    background: "#FFF6F6",
    color: "#B42318",
    border: "1px solid rgba(239,68,68,0.18)",
  },
  noteCard: {
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 14,
    display: "grid",
    gap: 12,
  },
  noteHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  noteTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  noteIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
  },
  noteTitle: { fontSize: 14, fontWeight: 950, color: "#0F172A" },
  noteSub: { fontSize: 12, fontWeight: 800, color: "#64748B" },
  noteInput: {
    width: "100%",
    border: "1px solid #E7E9F2",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    fontSize: 15,
    color: "#0F172A",
    background: "#fff",
    padding: 12,
    borderRadius: 14,
    minHeight: 90,
    boxSizing: "border-box",
  },
  sectionHeaderBlock: {
    display: "grid",
    gap: 4,
    marginTop: 2,
    marginBottom: 2,
  },
  sectionTitle: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },
  sectionText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.35,
  },
  sectionToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  summaryMini: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  summaryMiniLabel: { color: "#64748B", fontWeight: 800, fontSize: 13 },
  summaryMiniValue: { color: "#0F172A", fontWeight: 980, fontSize: 14 },
  tasksWrap: { display: "grid", gap: 16 },
  taskCard: {
    position: "relative",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    padding: 16,
    display: "grid",
    gap: 14,
  },
  taskAssetBlock: { display: "grid", gap: 10 },
  assetLeft: { display: "flex", alignItems: "flex-start", gap: 12 },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#667085",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  assetTitle: {
    fontWeight: 900,
    fontSize: 16,
    color: "#0F172A",
    lineHeight: 1.35,
  },
  assetPath: {
    color: "#667085",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.4,
    display: "flex",
    alignItems: "center",
  },
  taskPanel: {
    borderRadius: 18,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    padding: 18,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    cursor: "pointer",
  },
  taskPanelMain: { display: "grid", gap: 14 },
  taskMainTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  detailsGrid: {
    display: "grid",
    gap: 8,
    maxWidth: 620,
  },
  detailRow: {
    display: "grid",
    gridTemplateColumns: "170px 1fr",
    gap: 12,
    alignItems: "start",
  },
  detailLabel: { color: BLUE, fontWeight: 800, fontSize: 14 },
  detailValue: { color: "#667085", fontWeight: 800, fontSize: 14 },
  chronoSummaryBlock: {
    marginTop: 12,
    paddingTop: 14,
    borderTop: "1px solid #E7E9F2",
    display: "grid",
    gap: 8,
  },
  chronoSummaryHead: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    fontSize: 14,
    color: "#0F172A",
    marginBottom: 4,
  },
  chronoSummaryHint: {
    fontSize: 11,
    fontWeight: 700,
    color: "#94A3B8",
    lineHeight: 1.45,
    maxWidth: 560,
  },
  chevronWrap: { display: "grid", alignItems: "center", color: "#0F172A" },
  taskFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  footerItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#667085",
    fontWeight: 800,
    fontSize: 13,
  },
  priorityChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#FFE9EF",
    color: RED,
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
  },
  bottomSummary: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 12,
    justifyContent: "space-between",
  },
  bottomSummaryMain: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    flex: "1 1 auto",
    alignItems: "stretch",
  },
  bottomSummaryAction: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: "1 1 220px",
    minWidth: 0,
  },
  btnFinalizeOt: {
    width: "100%",
    maxWidth: 280,
    marginLeft: "auto",
    borderRadius: 16,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "12px 18px",
    fontWeight: 950,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 10px 28px rgba(8,159,138,0.22)",
  },
  btnFinalizeOtMuted: {
    background: "#F1F5F9",
    color: "#94A3B8",
    border: "1px solid #E2E8F0",
    boxShadow: "none",
    cursor: "pointer",
  },
  btnPrimaryDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  noteInputReadOnly: {
    background: "#F8FAFC",
    color: "#64748B",
  },
  summaryItem: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: "12px 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
  },
  summaryLabel: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
  },
  summaryValue: {
    color: "#0F172A",
    fontWeight: 980,
    fontSize: 14,
    marginTop: 2,
  },

  toolbarTabs: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  summaryMiniActive: {
    border: "1px solid rgba(8,159,138,0.35)",
    background: "#F1FBF8",
  },

  subtasksCard: {
    position: "relative",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    padding: 16,
    display: "grid",
    gap: 16,
    minHeight: 330,
  },

  subtasksHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    paddingTop: 4,
  },

  subtasksTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  subtasksChronoLegend: {
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    lineHeight: 1.35,
    maxWidth: 420,
  },

  subtasksCount: {
    fontSize: 13,
    fontWeight: 800,
    color: "#64748B",
  },

  subtasksList: {
    display: "grid",
    gap: 12,
  },

  subtaskItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 14,
    background: "#F8FAFC",
  },

  subtaskBullet: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    flexShrink: 0,
  },

  subtaskContent: {
    display: "grid",
    gap: 4,
  },

  subtaskName: {
    fontWeight: 900,
    color: "#0F172A",
    fontSize: 15,
  },

  subtaskMeta: {
    color: "#64748B",
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.4,
  },
  subtaskChronoRow: {
    marginTop: 10,
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 14px",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  subtaskChronoPill: {
    color: "#475569",
    background: "#F1F5F9",
    padding: "4px 10px",
    borderRadius: 8,
    border: "1px solid #E2E8F0",
  },
  subtaskChronoMetric: {
    color: "#64748B",
  },
  subtaskChronoLive: {
    color: ACCENT,
    fontWeight: 800,
  },
  subtaskChronoLiveDead: {
    color: "#B45309",
    fontWeight: 800,
  },

  emptySubtasksBox: {
    minHeight: 220,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 18,
    border: "1px dashed #CBD5E1",
    borderRadius: 18,
    background: "#F8FAFC",
    padding: 24,
    textAlign: "center",
  },

  emptySubtasksText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 15,
    lineHeight: 1.5,
    maxWidth: 460,
  },

  addCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(8,159,138,0.22)",
  },
  addCircleBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
    boxShadow: "none",
    background: "#E2E8F0",
    border: "1px solid #CBD5E1",
    color: "#94A3B8",
  },

  subtasksHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  addMiniCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: `1px solid ${ACCENT}`,
    background: "#fff",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  addMiniCircleBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
    border: "1px solid #CBD5E1",
    color: "#94A3B8",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },

  modalCard: {
    width: "min(560px, 100%)",
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 60px rgba(15,23,42,0.20)",
    overflow: "hidden",
    display: "grid",
  },

  modalHeader: {
    padding: "18px 20px",
    borderBottom: "1px solid #E7E9F2",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 950,
    color: "#0F172A",
  },

  modalSubtitle: {
    marginTop: 4,
    color: "#64748B",
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.4,
  },

  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#475467",
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1,
  },

  modalBody: {
    padding: 20,
    display: "grid",
    gap: 16,
  },

  fieldGroup: {
    display: "grid",
    gap: 8,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0F172A",
  },

  fieldInput: {
    width: "100%",
    border: "1px solid #D0D5DD",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },

  fieldTextarea: {
    width: "100%",
    border: "1px solid #D0D5DD",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },

  modalFooter: {
    padding: "16px 20px 20px",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    borderTop: "1px solid #E7E9F2",
  },

  subtaskTopRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  subtaskActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },

  subtaskIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid #D0D5DD",
    background: "#fff",
    color: "#475467",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  subtaskIconBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
};