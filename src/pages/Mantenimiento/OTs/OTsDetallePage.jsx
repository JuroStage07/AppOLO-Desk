import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  MoreVertical,
  Clock3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  Paperclip,
  Boxes,
  AlertTriangle,
  FileText,
  UserCircle2,
} from "lucide-react";

const ACCENT = "#089F8A";
const BLUE = "#2563EB";
const RED = "#FF4D73";

const mockOT = {
  id: "303",
  code: "OT - 303- PS",
  assignee: "ABELARDO OROPEZA",
  assigneeAvatar:
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80&fit=crop&crop=face",
  duration: "01:10:00",
  date: "2024-05-15",
  progress: 0,
  totalCost: "€ EUR 0,00",
  note: "Esto es una nota en una OT",
  tasksTotal: 1,
  tasks: [
    {
      id: "t1",
      asset: "COMPRESOR C-001 ALF { CAUIS013|GPART_CAU|1 }",
      path: "// DEMOS CLIENTES/ Carrefour/ Zon Este/ Cataluña/ Barcelona/ Carrefour Gran Vía L’Hospitalet/",
      title: "MANTENIMIENTO POR DEMANDA",
      taskType: "CORRECTIVO",
      class1: "GESTION MECANICA",
      class2: "",
      requestNo: "",
      scheduledDate: "2024-05-15",
      estimatedDuration: "01:10:00",
      resources: 0,
      attachments: 0,
      priority: "PRIORIDAD MUY ALTA",
      expanded: true,
    },
  ],
};

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

function ProgressBar({ value, totalCost }) {
  return (
    <div style={ui.progressBlock}>
      <div style={ui.progressTrack}>
        <div style={{ ...ui.progressFill, width: `${value}%` }} />
      </div>

      <div style={ui.progressMetaRow}>
        <div style={ui.progressMetaLeft}>{value}% completado</div>
        <div style={ui.progressMetaRight}>Costo total: {totalCost}</div>
      </div>
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
  const params = useParams();

  const [note, setNote] = useState(mockOT.note);
  const [tasks, setTasks] = useState(mockOT.tasks);

  const totalResources = useMemo(
    () => tasks.reduce((acc, t) => acc + Number(t.resources || 0), 0),
    [tasks]
  );

  const totalAttachments = useMemo(
    () => tasks.reduce((acc, t) => acc + Number(t.attachments || 0), 0),
    [tasks]
  );

  const toggleTask = (taskId) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, expanded: !task.expanded } : task
      )
    );
  };

  const handleSave = () => {
    console.log("Guardar OT", {
      otId: params.id || mockOT.id,
      note,
      tasks,
    });
  };

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

          <button type="button" onClick={handleSave} style={ui.btnPrimary}>
            <Save size={16} />
            Guardar
          </button>

          <button type="button" style={ui.iconGhostBtn}>
            <MoreVertical size={18} />
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
                <span style={ui.badge}>Detalle operativo</span>
              </div>

              <h1 style={ui.title}>Resumen de la OT</h1>
              <p style={ui.subtitle}>
                Revisá responsable, duración, fecha, nota general y el detalle
                de las tareas vinculadas a esta orden de trabajo.
              </p>
            </div>

            <div style={ui.heroNote}>
              <div style={ui.heroNoteTitle}>Código de OT</div>
              <div style={ui.heroNoteCode}>{mockOT.code}</div>
              <div style={ui.heroNoteText}>
                ID interno: <b>{params.id || mockOT.id}</b>
              </div>
            </div>
          </div>

          <div style={ui.mainCard}>
            <div style={ui.topAccent} />

            <div style={ui.cardHead}>
              <div style={ui.personWrap}>
                <img
                  src={mockOT.assigneeAvatar}
                  alt={mockOT.assignee}
                  style={ui.avatar}
                />

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={ui.personNameRow}>
                    <div style={ui.personName}>{mockOT.assignee}</div>
                    <ChevronDown size={16} color={BLUE} />
                  </div>

                  <div style={ui.metaRow}>
                    <SoftChip icon={<Clock3 size={13} />} text={mockOT.duration} />
                    <SoftChip icon={<CalendarDays size={13} />} text={mockOT.date} />
                  </div>
                </div>
              </div>

              <div style={ui.statusBox}>
                <div style={ui.statusDot} />
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={ui.statusTitle}>OT activa</div>
                  <div style={ui.statusSub}>Lista para seguimiento</div>
                </div>
              </div>
            </div>

            <ProgressBar value={mockOT.progress} totalCost={mockOT.totalCost} />

            <div style={ui.elapsedWrap}>
              <SoftChip
                icon={<Clock3 size={13} />}
                text="Tiempo transcurrido: 00:00:00"
                tone="accent"
              />
            </div>

            <div style={ui.noteCard}>
              <div style={ui.noteHeader}>
                <div style={ui.noteTitleWrap}>
                  <div style={ui.noteIcon}>
                    <FileText size={16} />
                  </div>
                  <div>
                    <div style={ui.noteTitle}>Nota</div>
                    <div style={ui.noteSub}>Observaciones generales de la OT</div>
                  </div>
                </div>
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={ui.noteInput}
                rows={4}
              />
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionTitle}>Tareas</div>
            <div style={ui.sectionText}>
              Detalle de tareas incluidas dentro de la orden.
            </div>
          </div>

          <div style={ui.sectionToolbar}>
            <div style={ui.summaryMini}>
              <span style={ui.summaryMiniLabel}>Total</span>
              <span style={ui.summaryMiniValue}>{tasks.length}</span>
            </div>

            <button type="button" style={ui.btnGhost}>
              <SlidersHorizontal size={16} />
              Filtros
            </button>
          </div>

          <div style={ui.tasksWrap}>
            {tasks.map((task) => (
              <div key={task.id} style={ui.taskCard}>
                <div style={ui.topAccent} />

                <div style={ui.taskAssetBlock}>
                  <div style={ui.assetLeft}>
                    <div style={ui.assetIcon}>
                      <Eye size={18} />
                    </div>

                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={ui.assetTitle}>{task.asset}</div>
                      <div style={ui.assetPath}>{task.path}</div>
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
                        <DetailRow label="Tipo de tarea:" value={task.taskType} />
                        <DetailRow label="Clasificación 1:" value={task.class1} />
                        <DetailRow label="Clasificación 2:" value={task.class2} />
                        <DetailRow label="Nro Solicitud:" value={task.requestNo} />
                        <DetailRow label="Fecha Programada:" value={task.scheduledDate} />
                        <DetailRow
                          label="Duración estimada:"
                          value={task.estimatedDuration}
                        />
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
                      <Boxes size={14} />
                      <span>RECURSOS</span>
                      <b>{task.resources}</b>
                    </div>

                    <div style={ui.footerDivider} />

                    <div style={ui.footerItem}>
                      <Paperclip size={14} />
                      <span>ADJUNTOS</span>
                      <b>{task.attachments}</b>
                    </div>
                  </div>

                  <PriorityChip text={task.priority} />
                </div>
              </div>
            ))}
          </div>

          <div style={ui.bottomSummary}>
            <div style={ui.summaryItem}>
              <div style={ui.summaryIcon}>
                <Boxes size={16} />
              </div>
              <div>
                <div style={ui.summaryLabel}>Recursos totales</div>
                <div style={ui.summaryValue}>{totalResources}</div>
              </div>
            </div>

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
                <div style={ui.summaryLabel}>Responsable</div>
                <div style={ui.summaryValue}>{mockOT.assignee}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,247,251,0.98) 100%)",
    backdropFilter: "blur(10px)",
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
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  iconGhostBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#64748B",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
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
    boxShadow: "0 18px 32px rgba(8,159,138,0.18)",
    whiteSpace: "nowrap",
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

  kickerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 4px rgba(8,159,138,0.14)",
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

  heroNoteTitle: {
    fontWeight: 980,
    color: "#0F172A",
  },

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

  personWrap: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    boxShadow: "0 8px 20px rgba(15,23,42,0.12)",
  },

  personNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

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
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    minWidth: 220,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 5px rgba(8,159,138,0.15)",
  },

  statusTitle: {
    fontWeight: 980,
    color: "#0F172A",
  },

  statusSub: {
    fontWeight: 800,
    fontSize: 12,
    color: "#64748B",
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

  progressBlock: {
    display: "grid",
    gap: 8,
  },

  progressTrack: {
    width: "100%",
    height: 9,
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

  progressMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
  },

  progressMetaLeft: {
    color: "#64748B",
  },

  progressMetaRight: {
    color: "#64748B",
  },

  elapsedWrap: {
    display: "flex",
    justifyContent: "flex-start",
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
    flexShrink: 0,
  },

  noteTitle: {
    fontSize: 14,
    fontWeight: 950,
    color: "#0F172A",
  },

  noteSub: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },

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
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },

  summaryMiniLabel: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
  },

  summaryMiniValue: {
    color: "#0F172A",
    fontWeight: 980,
    fontSize: 14,
  },

  tasksWrap: {
    display: "grid",
    gap: 16,
  },

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

  taskAssetBlock: {
    display: "grid",
    gap: 10,
  },

  assetLeft: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },

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

  taskPanelMain: {
    display: "grid",
    gap: 14,
  },

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

  detailLabel: {
    color: BLUE,
    fontWeight: 800,
    fontSize: 14,
  },

  detailValue: {
    color: "#667085",
    fontWeight: 800,
    fontSize: 14,
  },

  chevronWrap: {
    display: "grid",
    alignItems: "center",
    color: "#0F172A",
  },

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

  footerDivider: {
    width: 1,
    height: 18,
    background: "#D0D5DD",
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
    letterSpacing: 0.2,
  },

  bottomSummary: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  summaryItem: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
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
    flexShrink: 0,
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
};