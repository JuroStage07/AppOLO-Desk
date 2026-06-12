import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
  Wrench,
  MapPin,
  User,
  ChevronRight,
  Hash,
} from "lucide-react";

import { db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { filterSolicitudesOtByScope } from "../../../utils/dataScope";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
  useToast,
} from "../../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8,159,138,0.10)";
const ACCENT_MID = "rgba(8,159,138,0.25)";
const SLATE = "#64748B";

export const OT_STATE_FINALIZADA = "Finalizada";

function formatDate(val) {
  if (!val) return "—";
  try {
    const d = typeof val?.toDate === "function" ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export default function OTsFinalizadasPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { permisos, loading, profile } = useContext(AuthCtx);

  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);

  // filtros
  const [qText, setQText] = useState("");
  const [departamento, setDepartamento] = useState("all");
  const [desde, setDesde] = useState(""); // yyyy-mm-dd
  const [hasta, setHasta] = useState(""); // yyyy-mm-dd

  useEffect(() => {
    if (loading) return;
    if (!permisos?.mantenimiento) {
      toast.error("No tenés permisos para acceder a este módulo.");
      nav(-1);
    }
  }, [loading, permisos, nav, toast]);

  const fetchPage = async ({ reset } = { reset: false }) => {
    if (pageLoading) return;
    if (!permisos?.mantenimiento) return;
    if (!profile?.tenantId || !profile?.company) return;
    if (!hasMore && !reset) return;

    setPageLoading(true);
    if (reset) {
      setListLoading(true);
      setItems([]);
      setLastDoc(null);
      setHasMore(true);
      setLoadError("");
    }

    try {
      const base = [
        where("OTState", "==", OT_STATE_FINALIZADA),
        // Orden para paginar (requiere índice compuesto con OTState)
        orderBy("updatedAt", "desc"),
        orderBy("createdAt", "desc"),
        limit(10),
      ];

      const q = query(
        collection(db, "solicitudesOT"),
        ...(reset || !lastDoc ? base : [...base.slice(0, -1), startAfter(lastDoc), limit(10)])
      );

      const snap = await getDocs(q);

      const rows = filterSolicitudesOtByScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        profile?.tenantId,
        profile?.company
      );

      setItems((prev) => {
        if (reset) return rows;
        const seen = new Set(prev.map((r) => r.id));
        const next = [...prev];
        for (const r of rows) if (!seen.has(r.id)) next.push(r);
        return next;
      });

      const last = snap.docs[snap.docs.length - 1] ?? null;
      setLastDoc(last);
      setHasMore(snap.docs.length === 10);
      setLoadError("");
    } catch (err) {
      console.error(err);
      setLoadError("No se pudo cargar el listado. Revisá los índices de Firestore.");
      setHasMore(false);
    } finally {
      setPageLoading(false);
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (loading || !permisos?.mantenimiento) return;
    // reset + primera página cuando cambia el scope/permisos
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, permisos?.mantenimiento, profile?.tenantId, profile?.company]);

  const departamentosOptions = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const dep = String(it?.departamento || "").trim();
      if (dep) set.add(dep);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "es"))];
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = String(qText || "").trim().toLowerCase();
    const desdeMs = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const hastaMs = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;

    return items.filter((row) => {
      if (departamento !== "all") {
        if (String(row?.departamento || "").trim() !== departamento) return false;
      }

      const t =
        row?.updatedAt?.toMillis?.() ??
        row?.createdAt?.toMillis?.() ??
        (typeof row?.updatedAt === "string" ? new Date(row.updatedAt).getTime() : null) ??
        (typeof row?.createdAt === "string" ? new Date(row.createdAt).getTime() : null) ??
        null;

      if (desdeMs != null && (t == null || t < desdeMs)) return false;
      if (hastaMs != null && (t == null || t > hastaMs)) return false;

      if (!text) return true;

      const hay = [
        row?.NroSolicitud,
        row?.id,
        row?.nombreOT,
        row?.activoReferencia,
        row?.lugarProblema,
        row?.departamento,
        row?.solicitanteNombre,
        row?.responsableNombre,
        row?.descripcionOT,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      return hay.includes(text);
    });
  }, [items, qText, departamento, desde, hasta]);

  if (!permisos?.mantenimiento) return null;

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={CheckCircle2}
          title="OT Finalizadas"
          subtitle="Mantenimiento"
          onClick={() => nav("/mantenimiento/ots")}
        />
        <Topbar.Right>
          <Topbar.UserHint>
            {listLoading
              ? "Cargando…"
              : `${filteredItems.length} de ${items.length} cargadas`}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mantenimiento/ots")}>
            Órdenes de trabajo
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container max={720}>

          {/* hero */}
          <div style={ui.hero}>
            <div style={ui.heroIconWrap}>
              <CheckCircle2 size={28} strokeWidth={1.8} color={ACCENT} />
            </div>
            <div>
              <div style={ui.heroTitle}>Órdenes cerradas</div>
              <div style={ui.heroSub}>
                {listLoading
                  ? "Cargando…"
                  : `${filteredItems.length} de ${items.length} cargadas (finalizadas)`}
              </div>
            </div>
          </div>

          {/* filtros */}
          {!listLoading && !loadError && (
            <div style={ui.filtersCard}>
              <div style={ui.filtersGrid}>
                <div style={ui.filterBlock}>
                  <span style={ui.filterLabel}>Buscar</span>
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Nro, nombre, activo, lugar, solicitante…"
                    style={ui.filterInput}
                  />
                </div>

                <div style={ui.filterBlock}>
                  <span style={ui.filterLabel}>Departamento</span>
                  <select
                    value={departamento}
                    onChange={(e) => setDepartamento(e.target.value)}
                    style={ui.filterSelect}
                  >
                    {departamentosOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "all" ? "Todos" : opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={ui.filterBlock}>
                  <span style={ui.filterLabel}>Desde</span>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    style={ui.filterInput}
                  />
                </div>

                <div style={ui.filterBlock}>
                  <span style={ui.filterLabel}>Hasta</span>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    style={ui.filterInput}
                  />
                </div>
              </div>

              <div style={ui.filtersFooter}>
                <button
                  type="button"
                  onClick={() => {
                    setQText("");
                    setDepartamento("all");
                    setDesde("");
                    setHasta("");
                  }}
                  style={ui.clearBtn}
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          )}

          {/* estados */}
          {listLoading ? (
            <div style={ui.stateCard}>
              <div style={ui.stateSpinner} />
              <span style={ui.stateText}>Cargando órdenes…</span>
            </div>
          ) : loadError ? (
            <div style={{ ...ui.stateCard, borderColor: "rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.04)" }}>
              <span style={{ ...ui.stateText, color: "#DC2626" }}>{loadError}</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={ui.stateCard}>
              <ClipboardList size={32} color="#C4CAD8" strokeWidth={1.5} />
              <span style={ui.stateText}>
                {items.length === 0
                  ? "No hay OT finalizadas todavía."
                  : "No hay resultados para los filtros actuales."}
              </span>
            </div>
          ) : (
            <div style={ui.list}>
              {filteredItems.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  style={ui.rowCard}
                  onClick={() => nav(`/mantenimiento/ots-solicitud/${row.id}`)}
                >
                  {/* franja izquierda */}
                  <div style={ui.rowAccent} />

                  <div style={ui.rowBody}>
                    {/* fila superior */}
                    <div style={ui.rowTop}>
                      <div style={ui.rowTopLeft}>
                        <div style={ui.nroWrap}>
                          <Hash size={12} strokeWidth={2.5} color={ACCENT} />
                          <span style={ui.nro}>{row.NroSolicitud || row.id}</span>
                        </div>
                        <div style={ui.finBadge}>
                          <CheckCircle2 size={11} strokeWidth={2.5} color={ACCENT} />
                          Finalizada
                        </div>
                      </div>
                      <div style={ui.rowDate}>
                        <CalendarDays size={12} strokeWidth={2} color={SLATE} />
                        {formatDate(row.updatedAt ?? row.createdAt)}
                      </div>
                    </div>

                    {/* nombre OT */}
                    <div style={ui.otName}>{row.nombreOT || "Sin nombre"}</div>

                    {/* meta */}
                    <div style={ui.metaRow}>
                      {row.activoReferencia && (
                        <div style={ui.metaChip}>
                          <Wrench size={11} strokeWidth={2.2} color={SLATE} />
                          {row.activoReferencia}
                        </div>
                      )}
                      {row.lugarProblema && (
                        <div style={ui.metaChip}>
                          <MapPin size={11} strokeWidth={2.2} color={SLATE} />
                          {row.lugarProblema}
                        </div>
                      )}
                      {row.departamento && (
                        <div style={ui.metaChip}>
                          <ClipboardList size={11} strokeWidth={2.2} color={SLATE} />
                          {row.departamento}
                        </div>
                      )}
                      {(row.solicitanteNombre || row.responsableNombre) && (
                        <div style={ui.metaChip}>
                          <User size={11} strokeWidth={2.2} color={SLATE} />
                          {row.responsableNombre || row.solicitanteNombre}
                        </div>
                      )}
                    </div>

                    {/* descripción */}
                    {row.descripcionOT && (
                      <div style={ui.desc}>{row.descripcionOT}</div>
                    )}
                  </div>

                  <div style={ui.rowArrow}>
                    <ChevronRight size={18} strokeWidth={2.2} color={SLATE} />
                  </div>
                </button>
              ))}

              {/* paginación */}
              <div style={ui.pagerRow}>
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => fetchPage({ reset: false })}
                    disabled={pageLoading}
                    style={{ ...ui.loadMoreBtn, ...(pageLoading ? ui.loadMoreBtnBusy : {}) }}
                  >
                    {pageLoading ? "Cargando…" : "Cargar 10 más"}
                  </button>
                ) : (
                  <div style={ui.pagerDone}>No hay más resultados.</div>
                )}
              </div>
            </div>
          )}

        </Container>
      </Main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Shell>
  );
}

const ui = {
  /* hero */
  hero: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E5EF",
    padding: "18px 22px",
    boxShadow: "0 4px 20px rgba(15,23,42,0.05)",
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: ACCENT_SOFT,
    border: `1.5px solid ${ACCENT_MID}`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  heroTitle: { fontWeight: 980, fontSize: 18, color: "#0F172A", letterSpacing: -0.2 },
  heroSub: { fontWeight: 700, fontSize: 13, color: SLATE, marginTop: 3 },

  /* estado vacío / error */
  stateCard: {
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E5EF",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 4px 20px rgba(15,23,42,0.04)",
  },
  stateSpinner: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: `2.5px solid ${ACCENT_SOFT}`,
    borderTopColor: ACCENT,
    animation: "spin 0.8s linear infinite",
  },
  stateText: {
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
    textAlign: "center",
    maxWidth: 400,
    lineHeight: 1.5,
  },

  /* lista */
  list: { display: "grid", gap: 10 },

  /* filtros */
  filtersCard: {
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E5EF",
    padding: "16px 18px",
    boxShadow: "0 4px 20px rgba(15,23,42,0.04)",
    display: "grid",
    gap: 12,
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 0.8fr 0.8fr",
    gap: 12,
  },
  filterBlock: { display: "grid", gap: 6, minWidth: 0 },
  filterLabel: { fontSize: 12, fontWeight: 900, color: SLATE },
  filterInput: {
    height: 40,
    borderRadius: 12,
    border: "1.5px solid #DCE3EE",
    background: "#FAFBFE",
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 750,
    outline: "none",
    fontFamily: "inherit",
    color: "#0F172A",
  },
  filterSelect: {
    height: 40,
    borderRadius: 12,
    border: "1.5px solid #DCE3EE",
    background: "#FAFBFE",
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 750,
    outline: "none",
    fontFamily: "inherit",
    color: "#0F172A",
    cursor: "pointer",
  },
  filtersFooter: { display: "flex", justifyContent: "flex-end" },
  clearBtn: {
    height: 38,
    padding: "0 12px",
    borderRadius: 12,
    border: "1.5px solid #DCE3EE",
    background: "#fff",
    color: SLATE,
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  rowCard: {
    display: "flex",
    alignItems: "stretch",
    width: "100%",
    textAlign: "left",
    background: "#fff",
    borderRadius: 18,
    border: "1px solid #E2E5EF",
    boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
    cursor: "pointer",
    fontFamily: "inherit",
    overflow: "hidden",
    transition: "box-shadow 120ms ease, border-color 120ms ease",
    padding: 0,
  },
  rowAccent: {
    width: 4,
    flexShrink: 0,
    background: `linear-gradient(180deg, ${ACCENT} 0%, #06B89A 100%)`,
  },
  rowBody: {
    flex: 1,
    padding: "14px 16px",
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  rowArrow: {
    display: "flex",
    alignItems: "center",
    paddingRight: 14,
    flexShrink: 0,
  },

  rowTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  rowTopLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  nroWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 8,
    background: ACCENT_SOFT,
    border: `1px solid ${ACCENT_MID}`,
  },
  nro: {
    fontSize: 12,
    fontWeight: 900,
    color: ACCENT,
    letterSpacing: 0.2,
  },
  finBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 900,
    color: ACCENT,
    background: ACCENT_SOFT,
    border: `1px solid ${ACCENT_MID}`,
    padding: "3px 9px",
    borderRadius: 8,
  },
  rowDate: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
  },

  otName: {
    fontSize: 16,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.2,
    lineHeight: 1.3,
  },

  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  metaChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    background: "#F4F6FA",
    border: "1px solid #E2E5EF",
    padding: "3px 9px",
    borderRadius: 8,
  },

  desc: {
    fontSize: 13,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },

  pagerRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 6,
  },
  loadMoreBtn: {
    height: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: "none",
    background: "#0F172A",
    color: "#fff",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 22px rgba(15,23,42,0.14)",
  },
  loadMoreBtnBusy: {
    opacity: 0.75,
    cursor: "wait",
  },
  pagerDone: {
    fontSize: 12,
    fontWeight: 800,
    color: SLATE,
    padding: "10px 12px",
  },
};
