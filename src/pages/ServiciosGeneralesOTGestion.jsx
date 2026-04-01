import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  LayoutGrid,
  Loader2,
  LogOut,
  ShieldAlert,
  User,
} from "lucide-react";
import { AuthCtx } from "../auth/AuthProvider";
import { auth, db } from "../firebase";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";
const OT_STATE_EN_PROCESO = "En proceso";

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

export default function ServiciosGeneralesOTGestion() {
  const nav = useNavigate();
  const authCtx = useContext(AuthCtx);
  const role = authCtx?.role || "";
  const permisos = authCtx?.permisos || {};
  const canOpenMantenimientoDetail =
    role === "dev" || permisos?.mantenimiento === true;
  const user = auth.currentUser;
  const [busyLogout, setBusyLogout] = useState(false);
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  useEffect(() => {
    setListLoading(true);
    const q = query(
      collection(db, "solicitudesOT"),
      where("OTState", "==", OT_STATE_EN_PROCESO)
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        data.sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
          const tb = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        try {
          const withProgress = await Promise.all(
            data.map(async (row) => {
              const subSnap = await getDocs(
                collection(db, "solicitudesOT", row.id, "subtareas")
              );
              const total = subSnap.size;
              const done = subSnap.docs.filter((d) =>
                isSubtaskFirestoreCompleted(d.data())
              ).length;
              const progressPct =
                total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
              return {
                ...row,
                subtaskCount: total,
                subtaskCompletedCount: done,
                progressPct,
              };
            })
          );
          setRows(withProgress);
          setLoadError("");
          setListLoading(false);
        } catch (err) {
          console.error(err);
          setRows(data);
          setLoadError("No se pudo calcular el progreso de subtareas.");
          setListLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setRows([]);
        setLoadError("No se pudo cargar el listado de OTs en proceso.");
        setListLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const totalRows = rows.length;
  const permisosLabel = useMemo(() => {
    if (canOpenMantenimientoDetail) return "Con acceso a detalle";
    return "Sin acceso a detalle mantenimiento";
  }, [canOpenMantenimientoDetail]);

  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div style={ui.topbarLeft}>
            <button
              type="button"
              onClick={() => nav("/servicios-generales/ordenes-trabajo")}
              style={ui.backBtn}
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
              Órdenes de trabajo
            </button>
          </div>

          <div style={ui.brand}>
            <div style={ui.brandMark}>
              <LayoutGrid size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Gestión de OTs</div>
              <div style={ui.brandSub}>Servicios generales</div>
            </div>
          </div>

          <div style={ui.topbarRight}>
            <div style={ui.userBox}>
              <div style={ui.userAvatar}>
                <User size={16} strokeWidth={2.2} />
              </div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
                <div style={ui.userMail}>{user?.email || "—"}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              disabled={busyLogout}
              style={ui.btnGhost}
            >
              {busyLogout ? (
                <Loader2 size={16} style={{ animation: "sgotgSpin 0.7s linear infinite" }} />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
              Salir
            </button>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes sgotgSpin { to { transform: rotate(360deg); } }
      `}</style>

      <main style={ui.main}>
        <div style={ui.container}>
          <h1 style={ui.pageTitle}>Gestión de órdenes de trabajo</h1>
          <p style={ui.pageLead}>
            OTs actualmente en proceso. Si tenés permisos de mantenimiento o rol
            dev, podés abrir el detalle técnico.
          </p>
          <div style={ui.statsRow}>
            <div style={ui.statCard}>
              <ClipboardList size={16} color={ACCENT} />
              <span>{totalRows} OTs en proceso</span>
            </div>
            <div style={ui.statCardMuted}>
              <ShieldAlert size={16} color={canOpenMantenimientoDetail ? ACCENT : "#B45309"} />
              <span>{permisosLabel}</span>
            </div>
          </div>

          {listLoading ? (
            <div style={ui.placeholder}>
              <p style={ui.placeholderText}>Cargando OTs en proceso…</p>
            </div>
          ) : loadError ? (
            <div style={{ ...ui.placeholder, border: "1px dashed #FCA5A5", background: "#FEF2F2" }}>
              <p style={{ ...ui.placeholderText, color: "#B42318" }}>{loadError}</p>
            </div>
          ) : rows.length === 0 ? (
            <div style={ui.placeholder}>
              <p style={ui.placeholderText}>No hay OTs en estado En proceso.</p>
            </div>
          ) : (
            <ul style={ui.list}>
              {rows.map((row) => (
                <li key={row.id} style={ui.rowItem}>
                  <div style={ui.rowHead}>
                    <div style={ui.rowCode}>{row.NroSolicitud || `SOL-${row.id}`}</div>
                    <div style={ui.rowState}>{row.OTState || "—"}</div>
                  </div>

                  <div style={ui.rowTitle}>{row.nombreOT || "Sin nombre OT"}</div>
                  <div style={ui.rowMeta}>
                    <span>Activo: {row.activoReferencia || "—"}</span>
                    <span>Depto: {row.departamento || "—"}</span>
                  </div>
                  <div style={ui.rowMeta}>
                    <span>Solicitante: {row.solicitanteNombre || "—"}</span>
                    <span>Fecha: {formatDate(row.fecha || row.createdAt)}</span>
                  </div>

                  <div style={ui.progressWrap}>
                    <div style={ui.progressMeta}>
                      <span>Progreso</span>
                      <span>
                        {Number(row.subtaskCompletedCount) || 0}/
                        {Number(row.subtaskCount) || 0} subtareas
                        {" · "}
                        {Number(row.progressPct) || 0}%
                      </span>
                    </div>
                    <div style={ui.progressTrack}>
                      <div
                        style={{
                          ...ui.progressFill,
                          width: `${Number(row.progressPct) || 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div style={ui.rowActions}>
                    <button
                      type="button"
                      style={{
                        ...ui.btnPrimarySm,
                        ...(canOpenMantenimientoDetail ? {} : ui.btnPrimarySmDisabled),
                      }}
                      onClick={() => {
                        if (!canOpenMantenimientoDetail) {
                          alert(
                            "Para abrir el detalle necesitás permisos de Mantenimiento o rol dev."
                          );
                          return;
                        }
                        nav(`/mantenimiento/ots-solicitud/${row.id}`);
                      }}
                    >
                      Ver detalle
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    zIndex: 10,
  },
  topbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
  },
  topbarLeft: { display: "flex", justifyContent: "flex-start" },
  topbarRight: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifySelf: "center",
    minWidth: 0,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  brandTitle: {
    fontWeight: 950,
    fontSize: 15,
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },
  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    maxWidth: 260,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
    color: ACCENT,
    flexShrink: 0,
  },
  userName: {
    fontWeight: 900,
    fontSize: 12,
    color: "#0F172A",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userMail: {
    fontWeight: 700,
    fontSize: 11,
    color: SLATE,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "22px 16px 32px",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 16,
  },
  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  pageLead: {
    margin: 0,
    maxWidth: 720,
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
  },
  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(8, 159, 138, 0.25)",
    background: "#F3FBF9",
    color: "#0F172A",
    fontWeight: 800,
    fontSize: 12,
  },
  statCardMuted: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#fff",
    color: "#475467",
    fontWeight: 800,
    fontSize: 12,
  },
  placeholder: {
    padding: 22,
    borderRadius: 18,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
  },
  placeholderText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#64748B",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 12,
  },
  rowItem: {
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    background: "#fff",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  rowHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowCode: {
    fontWeight: 900,
    color: "#1D4ED8",
    fontSize: 13,
  },
  rowState: {
    fontSize: 11,
    fontWeight: 900,
    borderRadius: 999,
    padding: "4px 10px",
    background: "#FEF3C7",
    color: "#B45309",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: 850,
    color: "#0F172A",
    lineHeight: 1.3,
  },
  rowMeta: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    color: "#64748B",
    fontWeight: 700,
    fontSize: 12,
  },
  progressWrap: {
    display: "grid",
    gap: 6,
    marginTop: 2,
  },
  progressMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: "#64748B",
    fontWeight: 800,
    fontSize: 11,
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
  rowActions: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: 2,
  },
  btnPrimarySm: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 12,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnPrimarySmDisabled: {
    opacity: 0.55,
  },
};
