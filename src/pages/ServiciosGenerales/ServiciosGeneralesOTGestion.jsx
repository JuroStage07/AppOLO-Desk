import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  LayoutGrid,
  ListFilter,
  Loader2,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth, db } from "../../firebase";
import { filterSolicitudesOtByScope } from "../../utils/dataScope";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";
const OT_STATE_EN_PROCESO = "En proceso";
const OT_STATE_SOLICITADA = "Solicitada";

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** Coincide con solicitudes creadas por el usuario (uid en doc o nombre/email como respaldo). */
function isMiSolicitud(row, firebaseUser) {
  if (!firebaseUser) return false;
  const uid = String(firebaseUser.uid || "").trim();
  if (uid && row?.createdBy != null && String(row.createdBy).trim() === uid) return true;
  if (uid && row?.solicitanteUid != null && String(row.solicitanteUid).trim() === uid) {
    return true;
  }
  const email = norm(firebaseUser.email);
  if (email && norm(row?.solicitanteEmail) === email) return true;
  if (email && norm(row?.createdByEmail) === email) return true;
  const dn = norm(firebaseUser.displayName);
  const solNombre = norm(row?.solicitanteNombre);
  if (dn && solNombre && dn === solNombre) return true;
  return false;
}

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
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;
  const canOpenMantenimientoDetail =
    role === "dev" || permisos?.mantenimiento === true;
  const user = auth.currentUser;
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  /** "all" | "mine" */
  const [filterScope, setFilterScope] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    setListLoading(true);
    
    // Query para OTs en proceso
    const qEnProceso = query(
      collection(db, "solicitudesOT"),
      where("OTState", "==", OT_STATE_EN_PROCESO)
    );
    
    // Query para OTs solicitadas
    const qSolicitada = query(
      collection(db, "solicitudesOT"),
      where("OTState", "==", OT_STATE_SOLICITADA)
    );
    
    // Suscribirse a ambas queries
    const unsubEnProceso = onSnapshot(
      qEnProceso,
      async (snapEnProceso) => {
        try {
          // Obtener también las solicitadas
          const snapSolicitada = await getDocs(qSolicitada);
          
          // Combinar ambos resultados
          const allDocs = [
            ...snapEnProceso.docs,
            ...snapSolicitada.docs
          ];
          
          const data = filterSolicitudesOtByScope(
            allDocs.map((d) => ({
              id: d.id,
              ...d.data(),
            })),
            profile?.tenantId,
            profile?.company
          );
          
          data.sort((a, b) => {
            const ta = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
            const tb = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
          
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
          setLoadError("No se pudo calcular el progreso de subtareas.");
          setListLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setRows([]);
        setLoadError("No se pudo cargar el listado de OTs.");
        setListLoading(false);
      }
    );
    
    return () => unsubEnProceso();
  }, [authLoading, profile?.tenantId, profile?.company]);

  const totalRows = rows.length;
  const enProcesoCount = rows.filter((r) => r.OTState === OT_STATE_EN_PROCESO).length;
  const solicitadaCount = rows.filter((r) => r.OTState === OT_STATE_SOLICITADA).length;
  const misEnProceso = useMemo(
    () => rows.filter((r) => isMiSolicitud(r, user)),
    [rows, user]
  );
  const filteredRows = useMemo(() => {
    if (filterScope === "mine") return misEnProceso;
    return rows;
  }, [rows, filterScope, misEnProceso]);

  const permisosLabel = useMemo(() => {
    if (canOpenMantenimientoDetail) return "Con acceso a detalle";
    return "Sin acceso a detalle mantenimiento";
  }, [canOpenMantenimientoDetail]);

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={LayoutGrid}
          title="Gestión de OTs"
          subtitle="Servicios generales"
          onClick={() => nav("/servicios-generales/ordenes-trabajo")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/servicios-generales/ordenes-trabajo")}>
            Órdenes de trabajo
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <div style={ui.heroCard}>
            <div style={ui.heroAccent} aria-hidden />
            <div style={ui.heroTop}>
              <div>
                <h1 style={ui.pageTitle}>Órdenes en proceso y solicitadas</h1>
                <p style={ui.pageLead}>
                  Seguimiento de OT en estado <b>En proceso</b> y <b>Solicitada</b>. Filtrá por todas o solo las que
                  registraste. El detalle técnico requiere permiso de mantenimiento o rol dev.
                </p>
              </div>
            </div>

            <div style={ui.statsRow}>
              <div style={ui.statCard}>
                <ClipboardList size={18} color={ACCENT} strokeWidth={2.2} />
                <div style={ui.statCardText}>
                  <span style={ui.statCardValue}>{totalRows}</span>
                  <span style={ui.statCardLabel}>OTs totales (ámbito)</span>
                </div>
              </div>
              <div style={ui.statCardSecondary}>
                <div style={ui.statCardText}>
                  <span style={ui.statCardValue}>{enProcesoCount}</span>
                  <span style={ui.statCardLabel}>En proceso</span>
                </div>
              </div>
              <div style={ui.statCardSecondary}>
                <div style={ui.statCardText}>
                  <span style={ui.statCardValue}>{solicitadaCount}</span>
                  <span style={ui.statCardLabel}>Solicitadas</span>
                </div>
              </div>
              <div style={ui.statCardSecondary}>
                <UserCheck size={18} color={ACCENT} strokeWidth={2.2} />
                <div style={ui.statCardText}>
                  <span style={ui.statCardValue}>{misEnProceso.length}</span>
                  <span style={ui.statCardLabel}>Mis solicitudes</span>
                </div>
              </div>
              <div style={ui.statCardMuted}>
                <ShieldAlert size={18} color={canOpenMantenimientoDetail ? ACCENT : "#B45309"} />
                <div style={ui.statCardText}>
                  <span style={ui.statCardLabel}>{permisosLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={ui.filtersCard}>
            <div style={ui.filtersHeader}>
              <ListFilter size={18} color={ACCENT} strokeWidth={2.2} />
              <span style={ui.filtersTitle}>Vista del listado</span>
            </div>
            <div style={ui.filterChips} role="tablist" aria-label="Filtro de solicitudes">
              <button
                type="button"
                role="tab"
                aria-selected={filterScope === "all"}
                style={{
                  ...ui.filterChip,
                  ...(filterScope === "all" ? ui.filterChipActive : {}),
                }}
                onClick={() => setFilterScope("all")}
              >
                <LayoutGrid size={16} strokeWidth={2.2} />
                Todas las OT
                <span style={ui.filterChipBadge}>{totalRows}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterScope === "mine"}
                style={{
                  ...ui.filterChip,
                  ...(filterScope === "mine" ? ui.filterChipActive : {}),
                }}
                onClick={() => setFilterScope("mine")}
              >
                <UserCheck size={16} strokeWidth={2.2} />
                Mis solicitudes
                <span style={ui.filterChipBadge}>{misEnProceso.length}</span>
              </button>
            </div>
            <p style={ui.filtersHint}>
              {filterScope === "all"
                ? `Mostrando ${filteredRows.length} de ${totalRows} OTs (${enProcesoCount} en proceso, ${solicitadaCount} solicitadas).`
                : `Mostrando ${filteredRows.length} solicitud${filteredRows.length === 1 ? "" : "es"} que coinciden con tu usuario (creador o solicitante).`}
            </p>
          </div>

          {listLoading ? (
            <div style={ui.placeholder}>
              <Loader2
                size={22}
                color={ACCENT}
                style={{ animation: "sgotgSpin 0.75s linear infinite", marginBottom: 8 }}
              />
              <p style={ui.placeholderText}>Cargando OTs en proceso…</p>
            </div>
          ) : loadError ? (
            <div style={ui.placeholderError}>
              <p style={ui.placeholderErrorText}>{loadError}</p>
            </div>
          ) : rows.length === 0 ? (
            <div style={ui.placeholder}>
              <p style={ui.placeholderText}>No hay OTs en estado En proceso o Solicitada en tu ámbito.</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={ui.placeholder}>
              <p style={ui.placeholderText}>
                {filterScope === "mine"
                  ? "No tenés solicitudes en proceso o solicitadas en este listado. Probá «Todas las OT» o creá una nueva desde Órdenes de trabajo."
                  : "No hay resultados para este filtro."}
              </p>
            </div>
          ) : (
            <ul style={ui.list}>
              {filteredRows.map((row) => {
                const esMia = isMiSolicitud(row, user);
                return (
                  <li key={row.id} style={ui.rowItem}>
                    <div style={ui.rowAccent} aria-hidden />
                    <div style={ui.rowHead}>
                      <div style={ui.rowCode}>{row.NroSolicitud || `SOL-${row.id}`}</div>
                      <div style={ui.rowHeadRight}>
                        {esMia ? (
                          <span style={ui.badgeMia}>
                            <UserCheck size={12} strokeWidth={2.5} />
                            Tu solicitud
                          </span>
                        ) : null}
                        <div style={{
                          ...ui.rowState,
                          ...(row.OTState === OT_STATE_SOLICITADA ? ui.rowStateSolicitada : {}),
                        }}>
                          {row.OTState || "—"}
                        </div>
                      </div>
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
                        <span>Progreso de subtareas</span>
                        <span>
                          {Number(row.subtaskCompletedCount) || 0}/
                          {Number(row.subtaskCount) || 0}
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
                );
              })}
            </ul>
          )}
        </Container>
      </Main>

      <style>{`@keyframes sgotgSpin { to { transform: rotate(360deg); } }`}</style>
    </Shell>
  );
}

const ui = {
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 22,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 14px 40px rgba(15,23,42,0.06)",
    padding: "22px 20px 20px",
  },
  heroAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: 4,
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.2) 55%, transparent 100%)`,
  },
  heroTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  pageTitle: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 28px)",
    fontWeight: 980,
    letterSpacing: -0.45,
    color: "#0F172A",
    lineHeight: 1.15,
  },
  pageLead: {
    margin: "10px 0 0",
    maxWidth: 720,
    fontSize: 14,
    fontWeight: 650,
    color: SLATE,
    lineHeight: 1.5,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
    gap: 12,
  },
  statCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(8, 159, 138, 0.22)",
    background: "linear-gradient(180deg, #F3FBF9 0%, #fff 100%)",
  },
  statCardSecondary: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FAFAFB",
  },
  statCardMuted: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#fff",
  },
  statCardText: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  statCardValue: {
    fontWeight: 950,
    fontSize: 20,
    color: "#0F172A",
    letterSpacing: -0.3,
    lineHeight: 1.1,
  },
  statCardLabel: {
    fontWeight: 750,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.35,
  },
  filtersCard: {
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "16px 18px",
    boxShadow: "0 8px 26px rgba(15,23,42,0.04)",
  },
  filtersHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  filtersTitle: {
    fontWeight: 950,
    fontSize: 14,
    color: "#0F172A",
  },
  filterChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  filterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#475569",
    fontWeight: 850,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
  },
  filterChipActive: {
    border: `1px solid rgba(8,159,138,0.45)`,
    background: ACCENT_SOFT,
    color: "#0F172A",
    boxShadow: "0 6px 18px rgba(8,159,138,0.12)",
  },
  filterChipBadge: {
    marginLeft: 4,
    minWidth: 22,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.06)",
    fontWeight: 900,
    fontSize: 11,
    color: "#334155",
  },
  filtersHint: {
    margin: "12px 0 0",
    fontSize: 12,
    fontWeight: 700,
    color: "#94A3B8",
    lineHeight: 1.45,
  },
  placeholder: {
    padding: 28,
    borderRadius: 20,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
  },
  placeholderError: {
    padding: 22,
    borderRadius: 20,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
  },
  placeholderErrorText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 750,
    color: "#B42318",
    lineHeight: 1.45,
  },
  placeholderText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 750,
    color: "#64748B",
    lineHeight: 1.45,
    maxWidth: 420,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
  },
  rowItem: {
    position: "relative",
    overflow: "hidden",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    background: "#fff",
    padding: "16px 16px 14px",
    display: "grid",
    gap: 10,
    boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
    transition: "box-shadow 0.18s ease, border-color 0.18s ease",
  },
  rowAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    background: `linear-gradient(180deg, ${ACCENT} 0%, rgba(8,159,138,0.35) 100%)`,
    borderRadius: "18px 0 0 18px",
  },
  rowHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  rowHeadRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badgeMia: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(8,159,138,0.1)",
    border: "1px solid rgba(8,159,138,0.22)",
    color: ACCENT,
    fontWeight: 900,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.04,
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
  rowStateSolicitada: {
    background: "#E0E7FF",
    color: "#4338CA",
    border: "1px solid rgba(99, 102, 241, 0.35)",
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
