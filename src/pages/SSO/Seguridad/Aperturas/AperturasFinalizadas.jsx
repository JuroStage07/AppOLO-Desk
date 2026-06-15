// screens/aperturas/AperturasFinalizadas.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Filter,
  Hash,
  LayoutList,
  Lock,
  RotateCcw,
  Search,
  SlidersHorizontal,
  User,
} from "lucide-react";
import useIsMobile from "../../../../hooks/useIsMobile";
import { AuthCtx } from "../../../../auth/AuthProvider";
import {
  Brand,
  Container,
  EmptyState,
  ErrorState,
  GhostButton,
  Main,
  Shell,
  Skeleton,
  Topbar,
} from "../../../../components/ui";
import { ACCENT, ACCENT_SOFT, SLATE } from "../../../../styles/theme";

import { listenAperturasFinalizadasGlobal } from "../../../../services/aperturas";

/** Tope en cliente tras ordenar por fecha (evita congelar la UI si hay muchísimas finalizadas). */
const MAX_FINALIZADAS_EN_VISTA = 3000;

const TIPOS = [
  "Todos",
  "Recepcion EPA",
  "EPA Fiscal",
  "Cofersa",
  "Zona Franca",
  "Zona Franca Fiscal",
  "Otros",
  "Traslados",
  "Salidas de clientes",
];

const MESES = [
  { label: "Todos", value: "Todos" },
  { label: "Enero", value: "01" },
  { label: "Febrero", value: "02" },
  { label: "Marzo", value: "03" },
  { label: "Abril", value: "04" },
  { label: "Mayo", value: "05" },
  { label: "Junio", value: "06" },
  { label: "Julio", value: "07" },
  { label: "Agosto", value: "08" },
  { label: "Septiembre", value: "09" },
  { label: "Octubre", value: "10" },
  { label: "Noviembre", value: "11" },
  { label: "Diciembre", value: "12" },
];

const pad2 = (n) => String(n).padStart(2, "0");

/** Misma clave en distintos niveles según tipo de apertura / versión del doc. */
function aperturaNumeroExpedienteMatches(a, termLower) {
  if (!termLower) return true;
  const candidates = [
    a?.numeroExpediente,
    a?.formulario?.values?.numeroExpediente,
    a?.values?.numeroExpediente,
  ];
  return candidates.some((v) =>
    String(v ?? "").toLowerCase().includes(termLower)
  );
}

function getNumeroExpedienteDisplay(a) {
  return (
    a?.numeroExpediente ??
    a?.formulario?.values?.numeroExpediente ??
    a?.values?.numeroExpediente ??
    ""
  );
}

const FORMULARIO_SKIP_KEYS = new Set([
  "values",
  "metadata",
  "tipo",
  "completed",
  "completedAt",
  "updatedAt",
  "version",
  "type",
]);

/** Rutas habituales de numeroDua según tipo de formulario / versión del doc. */
function collectNumeroDuaCandidates(a) {
  const out = [];
  const form = a?.formulario;

  const add = (v) => {
    if (v !== undefined && v !== null) out.push(v);
  };

  add(a?.numeroDua);
  add(a?.values?.numeroDua);

  if (form && typeof form === "object") {
    add(form.values?.numeroDua);
    const tipo = form.tipo;
    if (tipo && typeof tipo === "string") add(form[tipo]?.values?.numeroDua);

    for (const k of Object.keys(form)) {
      if (FORMULARIO_SKIP_KEYS.has(k)) continue;
      const block = form[k];
      if (block && typeof block === "object" && block.values && typeof block.values === "object") {
        add(block.values.numeroDua);
      }
    }
  }

  return out;
}

function aperturaNumeroDuaMatches(a, termLower) {
  if (!termLower) return true;
  return collectNumeroDuaCandidates(a).some((v) =>
    String(v ?? "").toLowerCase().includes(termLower)
  );
}

function getNumeroDuaDisplay(a) {
  for (const v of collectNumeroDuaCandidates(a)) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * Fecha representativa para filtros por mes/año y orden. Incluye campos en raíz y dentro de
 * formulario (p. ej. proveedor_nacional.completedAt), como guarda el app móvil.
 */
const getDateFromApertura = (a) => {
  const candidates = [];
  const add = (v) => {
    if (v !== undefined && v !== null) candidates.push(v);
  };

  add(a?.completedAt);
  add(a?.fecha);
  add(a?.createdAt);
  add(a?.tiempoCerrada);
  add(a?.updatedAt);
  add(a?.formulario?.completedAt);
  add(a?.formulario?.metadata?.completedAt);

  const form = a?.formulario;
  if (form && typeof form === "object") {
    for (const k of Object.keys(form)) {
      if (FORMULARIO_SKIP_KEYS.has(k)) continue;
      const block = form[k];
      if (block && typeof block === "object") {
        add(block.completedAt);
        add(block.metadata?.completedAt);
      }
    }
  }

  for (const raw of candidates) {
    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (raw?.toDate) {
      const d = raw.toDate();
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
};

const formatFecha = (isoOrTs) => {
  if (!isoOrTs) return "";
  const toLocale = (d) => {
    try {
      return d.toLocaleString("es-CR");
    } catch {
      return d.toLocaleString();
    }
  };

  if (typeof isoOrTs === "string" || typeof isoOrTs === "number") {
    const d = new Date(isoOrTs);
    return Number.isNaN(d.getTime()) ? "" : toLocale(d);
  }
  if (isoOrTs?.toDate) {
    const d = isoOrTs.toDate();
    return Number.isNaN(d.getTime()) ? "" : toLocale(d);
  }
  return "";
};

export default function AperturasFinalizadas() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [hovered, setHovered] = useState(null);

  // data
  const [aperturasFinalizadas, setAperturasFinalizadas] = useState(undefined);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // filtros
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("fecha"); // "fecha" | "nombre"
  const [tipoSeleccionado, setTipoSeleccionado] = useState("Todos");
  const [mesSeleccionado, setMesSeleccionado] = useState("Todos");
  const [anioSeleccionado, setAnioSeleccionado] = useState("Todos");
  const [visibleCount, setVisibleCount] = useState(10);

  const go = (path) => nav(path);

  const reload = () => {
    setLoadError(null);
    setAperturasFinalizadas(undefined);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    if (authLoading) return;
    const unsub = listenAperturasFinalizadasGlobal(
      (rows) => {
        setLoadError(null);
        setAperturasFinalizadas(rows);
      },
      profile?.tenantId,
      profile?.company,
      (err) => {
        setLoadError(
          err?.message || "No se pudieron cargar las aperturas finalizadas."
        );
        // Salir del estado de carga para que se muestre el error.
        setAperturasFinalizadas((prev) => (prev === undefined ? [] : prev));
      }
    );
    return () => unsub?.();
  }, [authLoading, profile?.tenantId, profile?.company, reloadKey]);

  useEffect(() => {
    setVisibleCount(10);
  }, [query, sortKey, tipoSeleccionado, mesSeleccionado, anioSeleccionado, aperturasFinalizadas]);

  const limpiarFiltros = () => {
    setQuery("");
    setSortKey("fecha");
    setTipoSeleccionado("Todos");
    setMesSeleccionado("Todos");
    setAnioSeleccionado("Todos");
  };

  const data = useMemo(() => {
    const term = query.trim().toLowerCase();

    const getTime = (a) => {
      const d = getDateFromApertura(a);
      return d ? d.getTime() : 0;
    };

    // El listener ya trae solo estado === "finalizada". No exijamos completed en raíz:
    // en el mobile a veces solo queda en formulario.<tipo>.completed.
    const completas = (aperturasFinalizadas || []).filter(
      (a) => (a?.estado || "").toLowerCase() === "finalizada"
    );

    const baseSlice = [...completas]
      .sort((a, b) => getTime(b) - getTime(a))
      .slice(0, MAX_FINALIZADAS_EN_VISTA);

    const years = Array.from(
      new Set(
        baseSlice
          .map((a) => getDateFromApertura(a)?.getFullYear())
          .filter((y) => typeof y === "number")
      )
    ).sort((a, b) => b - a);

    const filtradas = baseSlice.filter((a) => {
      const coincideTexto =
        !term ||
        (a.nombre || "").toLowerCase().includes(term) ||
        (a.tipo || "").toLowerCase().includes(term) ||
        String(a.numeroMarchamo || "").toLowerCase().includes(term) ||
        aperturaNumeroExpedienteMatches(a, term) ||
        aperturaNumeroDuaMatches(a, term);

      const coincideTipo = tipoSeleccionado === "Todos" || a.tipo === tipoSeleccionado;

      const d = getDateFromApertura(a);
      const mm = d ? pad2(d.getMonth() + 1) : null;
      const yyyy = d ? String(d.getFullYear()) : null;

      const coincideMes = mesSeleccionado === "Todos" || (mm && mm === mesSeleccionado);
      const coincideAnio = anioSeleccionado === "Todos" || (yyyy && yyyy === anioSeleccionado);

      return coincideTexto && coincideTipo && coincideMes && coincideAnio;
    });

    const ordenadas = [...filtradas].sort((a, b) => {
      if (sortKey === "nombre") {
        return (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" });
      }
      return getTime(b) - getTime(a);
    });

    const items = ordenadas.slice(0, visibleCount);
    return { items, total: ordenadas.length, baseTotal: baseSlice.length, years };
  }, [
    aperturasFinalizadas,
    query,
    sortKey,
    tipoSeleccionado,
    mesSeleccionado,
    anioSeleccionado,
    visibleCount,
  ]);

  const isLoading = aperturasFinalizadas === undefined;
  const hayMas = data.total > data.items.length;

  const filtrosLabel = `${tipoSeleccionado} · ${mesSeleccionado === "Todos" ? "Todos los meses" : `Mes ${mesSeleccionado}`
    } · ${anioSeleccionado}`;
  const m = isMobile;

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Salud ocupacional"
          subtitle="Aperturas finalizadas"
          onClick={() => go("/seguridad/aperturas")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/seguridad/aperturas")}>
            Administrar
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <section style={{ ...ui.hero, ...(m ? ui.mHero : {}) }}>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <span style={ui.kicker}>Historial</span>
                <span style={ui.badge}>
                  <Lock size={12} strokeWidth={2.5} style={{ marginRight: 5, verticalAlign: "middle" }} />
                  Finalizadas
                </span>
              </div>
              <h1 style={ui.title}>Aperturas finalizadas</h1>
              <p style={ui.subtitle}>
                Consultá el historial cerrado. La búsqueda incluye nombre, tipo, marchamo, número de
                expediente y número DUA.
              </p>
            </div>

            <div style={{ ...ui.statsRow, ...(m ? ui.mStatsRow : {}) }}>
              <div style={ui.statCard}>
                <div style={ui.statCardLabel}>En pantalla</div>
                <div style={ui.statCardValue}>
                  {isLoading ? "—" : `${data.items.length}`}
                  <span style={ui.statCardSuffix}>
                    / {isLoading ? "…" : data.total}
                  </span>
                </div>
              </div>
              <div style={ui.statCard}>
                <div style={ui.statCardLabel}>
                  En base (últ. {MAX_FINALIZADAS_EN_VISTA.toLocaleString("es-CR")})
                </div>
                <div style={ui.statCardValue}>{isLoading ? "—" : data.baseTotal}</div>
              </div>
              <div style={{ ...ui.statCard, ...ui.statCardWide }}>
                <div style={ui.statCardLabel}>Filtros activos</div>
                <div style={ui.statCardMeta}>{filtrosLabel}</div>
              </div>
            </div>
          </section>

          <div style={{ ...ui.searchCard, ...(m ? ui.mSearchCard : {}) }}>
            <div style={ui.searchInner}>
              <Search size={18} color={SLATE} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, tipo, marchamo, n.º expediente o DUA…"
                style={ui.searchInput}
                aria-label="Buscar aperturas"
              />
              {query ? (
                <button
                  type="button"
                  style={ui.searchClear}
                  onClick={() => setQuery("")}
                  title="Limpiar búsqueda"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
            <div style={{ ...ui.searchActions, ...(m ? ui.mSearchActions : {}) }}>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                style={{
                  ...(showFilters ? ui.btnFilterActive : ui.btnGhost),
                  ...(m ? ui.mBtnGhost : {}),
                }}
                disabled={false}
              >
                <span style={ui.btnInlineIcon}>
                  <SlidersHorizontal size={16} strokeWidth={2.2} />
                  Filtros
                  {showFilters ? (
                    <ChevronUp size={16} strokeWidth={2.2} />
                  ) : (
                    <ChevronDown size={16} strokeWidth={2.2} />
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVisibleCount(10)}
                style={{ ...ui.btnGhost, ...(m ? ui.mBtnGhost : {}) }}
                disabled={isLoading}
                title="Volver al inicio de la lista"
              >
                <span style={ui.btnInlineIcon}>
                  <RotateCcw size={16} strokeWidth={2.2} />
                  Lista al inicio
                </span>
              </button>
            </div>
          </div>

          {showFilters ? (
            <section style={ui.filterCard} aria-label="Filtros avanzados">
              <div style={ui.filterCardHead}>
                <Filter size={18} color={ACCENT} strokeWidth={2.2} />
                <span style={ui.filterCardTitle}>Refinar resultados</span>
              </div>
              <div style={{ ...ui.filterGrid, ...(m ? ui.mFilterGrid : {}) }}>
                <label style={ui.fieldLabel}>
                  Tipo
                  <div style={ui.selectWrap}>
                    <LayoutList size={16} color={SLATE} strokeWidth={2.2} />
                    <select
                      value={tipoSeleccionado}
                      onChange={(e) => setTipoSeleccionado(e.target.value)}
                      style={ui.select}
                    >
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label style={ui.fieldLabel}>
                  Mes
                  <div style={ui.selectWrap}>
                    <CalendarDays size={16} color={SLATE} strokeWidth={2.2} />
                    <select
                      value={mesSeleccionado}
                      onChange={(e) => setMesSeleccionado(e.target.value)}
                      style={ui.select}
                    >
                      {MESES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label style={ui.fieldLabel}>
                  Año
                  <div style={ui.selectWrap}>
                    <CalendarDays size={16} color={SLATE} strokeWidth={2.2} />
                    <select
                      value={anioSeleccionado}
                      onChange={(e) => setAnioSeleccionado(e.target.value)}
                      style={ui.select}
                    >
                      <option value="Todos">Todos</option>
                      {(data.years || []).map((y) => (
                        <option key={String(y)} value={String(y)}>
                          {String(y)}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <div style={ui.fieldLabel}>
                  Orden
                  <div style={ui.sortRow}>
                    <button
                      type="button"
                      onClick={() => setSortKey("fecha")}
                      style={{
                        ...ui.sortBtn,
                        ...(sortKey === "fecha" ? ui.sortBtnActive : {}),
                      }}
                    >
                      Más recientes
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortKey("nombre")}
                      style={{
                        ...ui.sortBtn,
                        ...(sortKey === "nombre" ? ui.sortBtnActive : {}),
                      }}
                    >
                      Nombre A→Z
                    </button>
                  </div>
                </div>
              </div>

              <div style={ui.filterFooter}>
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  style={{ ...ui.btnGhost, ...(m ? ui.mBtnGhost : {}) }}
                  disabled={false}
                >
                  <span style={ui.btnInlineIcon}>
                    <RotateCcw size={16} strokeWidth={2.2} />
                    Restablecer filtros
                  </span>
                </button>
              </div>
            </section>
          ) : null}

          {loadError ? (
            <ErrorState description={loadError} onRetry={reload} />
          ) : isLoading ? (
            <Skeleton.List rows={5} height={120} />
          ) : data.items.length === 0 ? (
            <EmptyState
              center
              icon={FileText}
              title="Sin resultados"
              description="No hay aperturas que coincidan con la búsqueda o los filtros. Probá ampliar criterios o limpiar filtros."
            />
          ) : (
            <>
              <div style={{ ...ui.listGrid, ...(m ? ui.mListGrid : {}) }}>
                {data.items.map((item, idx) => {
                  const cuando = item?.completedAt || item?.fecha || item?.createdAt;
                  const isHover = hovered === (item.id ?? idx);
                  const expediente = getNumeroExpedienteDisplay(item);
                  const numeroDua = getNumeroDuaDisplay(item);
                  const marchamo =
                    item.numeroMarchamo ||
                    item?.formulario?.values?.numeroMarchamo ||
                    item?.values?.numeroMarchamo ||
                    "";

                  return (
                    <article
                      key={String(item.id ?? idx)}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => setHovered(item.id ?? idx)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() =>
                        go(`/seguridad/aperturas/detalle/${encodeURIComponent(String(item.id ?? idx))}`)
                      }
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        go(`/seguridad/aperturas/detalle/${encodeURIComponent(String(item.id ?? idx))}`)
                      }
                      style={{
                        ...ui.itemCard,
                        ...(isHover ? ui.itemCardHover : {}),
                      }}
                      aria-label={`Ver detalle de ${item.nombre || "apertura"}`}
                    >
                      <div style={ui.itemCardAccent} aria-hidden />
                      <div style={ui.itemTop}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={ui.itemTitle}>{item.nombre || "(Sin nombre)"}</div>
                          <div style={ui.itemSub}>
                            <span style={ui.tipoPill}>{item.tipo || "—"}</span>
                            <span style={ui.dot}>·</span>
                            <span style={ui.muted}>{item.tipoFormulario || "Sin formulario"}</span>
                          </div>
                        </div>
                        <span style={ui.statePill}>
                          <Lock size={13} strokeWidth={2.5} style={{ marginRight: 5 }} />
                          Finalizada
                        </span>
                      </div>

                      <div style={ui.itemChips}>
                        <span style={{ ...ui.smallPill, ...ui.smallPillOk }}>Completa</span>
                        <span style={ui.smallPill}>
                          <User size={13} strokeWidth={2.2} style={{ marginRight: 5 }} />
                          {item.creadoPorNombre || "—"}
                        </span>
                      </div>

                      <dl style={{ ...ui.detailsGrid, ...(m ? ui.mDetailsGrid : {}) }}>
                        <div style={ui.detailCell}>
                          <dt style={ui.detailDt}>
                            <CalendarDays size={14} strokeWidth={2.2} style={ui.detailDtIcon} />
                            Cierre
                          </dt>
                          <dd style={ui.detailDd}>{formatFecha(cuando) || "—"}</dd>
                        </div>
                        <div style={ui.detailCell}>
                          <dt style={ui.detailDt}>
                            <Hash size={14} strokeWidth={2.2} style={ui.detailDtIcon} />
                            Marchamo
                          </dt>
                          <dd style={ui.detailDd}>{marchamo || "—"}</dd>
                        </div>
                        <div style={ui.detailCell}>
                          <dt style={ui.detailDt}>
                            <FileText size={14} strokeWidth={2.2} style={ui.detailDtIcon} />
                            N.º DUA
                          </dt>
                          <dd style={{ ...ui.detailDd, ...ui.detailDdMono }}>{numeroDua || "—"}</dd>
                        </div>
                        <div style={ui.detailCell}>
                          <dt style={ui.detailDt}>
                            <FileText size={14} strokeWidth={2.2} style={ui.detailDtIcon} />
                            N.º expediente
                          </dt>
                          <dd style={{ ...ui.detailDd, ...ui.detailDdMono }}>
                            {expediente || "—"}
                          </dd>
                        </div>
                      </dl>

                      <div style={ui.itemFooter}>
                        <span style={ui.link}>
                          Ver detalle
                          <ArrowRight size={14} strokeWidth={2.5} style={{ marginLeft: 6 }} />
                        </span>
                        <span style={ui.metaHint} title="Identificador en base de datos">
                          {String(item.id ?? idx).slice(0, 12)}
                          {(String(item.id ?? idx).length > 12 ? "…" : "")}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div style={ui.listFooter}>
                {hayMas ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 10)}
                    style={ui.loadMoreBtn}
                  >
                    Cargar 10 más
                  </button>
                ) : (
                  <span style={ui.endPill}>Fin de resultados</span>
                )}
              </div>
            </>
          )}
        </Container>
      </Main>

      <style>{`
        @keyframes aperturasFinalizadasSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Shell>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
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
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
  },
  topbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
  },
  brandTitle: { fontWeight: 950, fontSize: 14, color: "#0F172A" },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },

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
    borderRadius: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#0F172A",
    boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },
  btnFilterActive: {
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: "#0F172A",
    borderRadius: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    boxShadow: "0 4px 14px rgba(8,159,138,0.12)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },
  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "18px 16px 28px",
    WebkitOverflowScrolling: "touch",
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

  hero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: 18,
    alignItems: "start",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    alignContent: "start",
  },
  statCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: "14px 16px",
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  },
  statCardWide: {
    gridColumn: "span 1",
    minWidth: 0,
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.04,
    textTransform: "uppercase",
    color: SLATE,
    marginBottom: 6,
  },
  statCardValue: {
    fontSize: 22,
    fontWeight: 950,
    color: "#0F172A",
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  statCardSuffix: {
    fontSize: 15,
    fontWeight: 800,
    color: SLATE,
    marginLeft: 4,
  },
  statCardMeta: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },

  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 3px rgba(8,159,138,0.2)",
  },
  kicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 800,
    padding: "5px 11px",
    borderRadius: 999,
    background: "#fff",
    border: "1px solid #E7E9F2",
    color: "#334155",
    display: "inline-flex",
    alignItems: "center",
  },

  title: { margin: 0, fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 950, letterSpacing: -0.4 },
  subtitle: {
    margin: 0,
    color: SLATE,
    fontWeight: 650,
    lineHeight: 1.5,
    fontSize: 14,
    maxWidth: 520,
  },

  searchCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: "14px 16px",
    boxShadow: "0 12px 32px rgba(15,23,42,0.07)",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
  },
  searchInner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flex: "1 1 240px",
    minWidth: 0,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: "10px 14px",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    fontWeight: 600,
    fontSize: 14,
    color: "#0F172A",
    background: "transparent",
    fontFamily: "inherit",
  },
  searchClear: {
    border: "none",
    background: "transparent",
    color: ACCENT,
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 6px",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  searchActions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  filterCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: "16px 18px",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },
  filterCardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: "1px solid #F1F5F9",
  },
  filterCardTitle: { fontWeight: 900, fontSize: 15, color: "#0F172A" },
  filterGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    alignItems: "end",
  },
  fieldLabel: {
    display: "grid",
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.05,
    color: SLATE,
  },

  selectWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#fff",
    padding: "10px 12px",
  },
  select: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontWeight: 700,
    fontSize: 14,
    color: "#0F172A",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  sortRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  sortBtn: {
    flex: 1,
    minWidth: 130,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#334155",
    fontFamily: "inherit",
  },
  sortBtnActive: {
    background: ACCENT,
    color: "#fff",
    borderColor: ACCENT,
    boxShadow: "0 6px 18px rgba(8,159,138,0.25)",
  },

  filterFooter: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #F1F5F9",
    display: "flex",
    justifyContent: "flex-end",
  },

  listGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
  },

  itemCard: {
    position: "relative",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: "16px 16px 14px",
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    overflow: "hidden",
  },
  itemCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.2) 55%, transparent 100%)`,
    pointerEvents: "none",
  },
  itemCardHover: {
    transform: "translateY(-3px)",
    boxShadow: "0 20px 44px rgba(15,23,42,0.1)",
    borderColor: "rgba(8,159,138,0.35)",
  },

  itemTop: { display: "flex", gap: 12, alignItems: "flex-start" },
  itemTitle: {
    fontWeight: 950,
    fontSize: 16,
    color: "#0F172A",
    lineHeight: 1.25,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  itemSub: {
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    fontSize: 12,
    fontWeight: 650,
    color: "#475569",
  },
  tipoPill: {
    background: ACCENT_SOFT,
    color: "#0F766E",
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
  },
  dot: { color: "#CBD5E1" },
  muted: { color: SLATE, fontWeight: 650 },

  statePill: {
    padding: "6px 11px",
    borderRadius: 999,
    border: "1px solid rgba(8,159,138,0.25)",
    background: ACCENT_SOFT,
    fontWeight: 800,
    fontSize: 11,
    color: "#0F766E",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
  },

  itemChips: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  smallPill: {
    padding: "6px 11px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    fontWeight: 700,
    fontSize: 12,
    color: "#334155",
    display: "inline-flex",
    alignItems: "center",
  },
  smallPillOk: {
    background: "#ECFDF5",
    borderColor: "rgba(16,185,129,0.35)",
    color: "#047857",
  },

  detailsGrid: {
    margin: 0,
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid #F1F5F9",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px 16px",
  },
  detailCell: { margin: 0, minWidth: 0 },
  detailDt: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.06,
    color: SLATE,
    margin: 0,
    marginBottom: 4,
  },
  detailDtIcon: { flexShrink: 0, opacity: 0.85 },
  detailDd: { margin: 0, fontSize: 13, fontWeight: 750, color: "#0F172A", lineHeight: 1.35 },
  detailDdMono: { fontVariantNumeric: "tabular-nums", letterSpacing: 0.02 },

  itemFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid #F1F5F9",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  link: {
    color: ACCENT,
    fontWeight: 850,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
  },
  metaHint: {
    color: "#94A3B8",
    fontWeight: 700,
    fontSize: 11,
    fontFamily: "ui-monospace, monospace",
  },

  listFooter: {
    display: "grid",
    placeItems: "center",
    paddingTop: 8,
    paddingBottom: 8,
  },
  loadMoreBtn: {
    borderRadius: 12,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    padding: "12px 22px",
    cursor: "pointer",
    fontWeight: 850,
    fontSize: 14,
    color: "#fff",
    boxShadow: "0 12px 28px rgba(8,159,138,0.3)",
    fontFamily: "inherit",
  },
  endPill: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    fontWeight: 750,
    fontSize: 13,
    color: SLATE,
  },

  emptyWrap: {
    padding: "36px 24px",
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, #F8FAFC 100%)",
    display: "grid",
    placeItems: "center",
    gap: 8,
    boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
    textAlign: "center",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: `1px solid rgba(8,159,138,0.2)`,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyIconMuted: {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: 950, fontSize: 17, color: "#0F172A" },
  emptyText: {
    color: SLATE,
    fontWeight: 650,
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: 400,
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 12px 6px 6px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
    maxWidth: 220,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userName: {
    fontWeight: 800,
    fontSize: 12,
    color: "#0F172A",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userMail: {
    fontWeight: 650,
    fontSize: 11,
    color: SLATE,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // mobile overrides
  mShell: { minHeight: "100dvh", height: "100dvh" },
  mTopbar: { position: "sticky", top: 0, zIndex: 120 },
  mTopbarInner: { padding: "10px 12px", minHeight: 56, gap: 8 },
  mTopbarRight: { width: "100%", justifyContent: "flex-start", gap: 8 },
  mUserBox: { display: "none" },
  mBtnGhost: { width: "100%", justifyContent: "center", minHeight: 40 },
  mMain: { padding: "12px 10px 18px" },
  mContainer: { gap: 12 },
  mHero: { gap: 12 },
  mStatsRow: { gridTemplateColumns: "1fr", gap: 8 },
  mSearchCard: { padding: "10px 10px", gap: 8 },
  mSearchActions: { width: "100%", justifyContent: "stretch" },
  mFilterGrid: { gridTemplateColumns: "1fr", gap: 10 },
  mListGrid: { gridTemplateColumns: "1fr", gap: 10 },
  mDetailsGrid: { gridTemplateColumns: "1fr", gap: "10px 12px" },
};
