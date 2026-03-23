// screens/aperturas/AperturasFinalizadas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";

import { listenAperturasFinalizadasGlobal } from "../../services/aperturas";

const ACCENT = "#089F8A";

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

const getDateFromApertura = (a) => {
  const raw = a?.completedAt || a?.fecha || a?.createdAt;
  if (!raw) return null;

  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (raw?.toDate) {
    const d = raw.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
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
  const user = auth.currentUser;

  const [busyLogout, setBusyLogout] = useState(false);
  const [hovered, setHovered] = useState(null);

  // data
  const [aperturasFinalizadas, setAperturasFinalizadas] = useState(undefined);

  // filtros
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("fecha"); // "fecha" | "nombre"
  const [tipoSeleccionado, setTipoSeleccionado] = useState("Todos");
  const [mesSeleccionado, setMesSeleccionado] = useState("Todos");
  const [anioSeleccionado, setAnioSeleccionado] = useState("Todos");
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prev;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  useEffect(() => {
    const unsub = listenAperturasFinalizadasGlobal(setAperturasFinalizadas);
    return () => unsub?.();
  }, []);

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

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const go = (path) => nav(path);

  const data = useMemo(() => {
    const term = query.trim().toLowerCase();

    const getTime = (a) => {
      if (a?.completedAt) {
        const t = new Date(a.completedAt).getTime();
        if (!Number.isNaN(t)) return t;
      }
      if (a?.fecha) {
        const t = new Date(a.fecha).getTime();
        if (!Number.isNaN(t)) return t;
      }
      const ca = a?.createdAt;
      if (ca?.toDate) return ca.toDate().getTime();
      if (typeof ca === "number") return ca;
      return 0;
    };

    const completas = (aperturasFinalizadas || []).filter((a) => {
      const completed =
        a?.completed === true ||
        a?.formulario?.completed === true ||
        a?.metadata?.completed === true;

      const finalizada = (a?.estado || "").toLowerCase() === "finalizada";
      return completed && finalizada;
    });

    const top1000 = [...completas].sort((a, b) => getTime(b) - getTime(a)).slice(0, 1000);

    const years = Array.from(
      new Set(
        top1000
          .map((a) => getDateFromApertura(a)?.getFullYear())
          .filter((y) => typeof y === "number")
      )
    ).sort((a, b) => b - a);

    const filtradas = top1000.filter((a) => {
      const coincideTexto =
        !term ||
        (a.nombre || "").toLowerCase().includes(term) ||
        (a.tipo || "").toLowerCase().includes(term) ||
        String(a.numeroMarchamo || "").toLowerCase().includes(term);

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
    return { items, total: ordenadas.length, baseTotal: top1000.length, years };
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

  return (
    <div style={ui.shell}>
      {/* Topbar */}
      <div style={ui.topbar}>
        <div style={ui.brand} role="button" tabIndex={0} onClick={() => go("/salud/aperturas")}>
          <div style={ui.brandMark}>AP</div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>Aperturas</div>
            <div style={ui.brandSub}>Finalizadas</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <div style={ui.userBox}>
            <div style={ui.userAvatar}>
              {(user?.displayName || user?.email || "U")[0]?.toUpperCase?.()}
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
              <div style={ui.userMail}>{user?.email || "—"}</div>
            </div>
          </div>

          <button type="button" onClick={() => go("/salud/aperturas")} style={ui.btnGhost} disabled={busyLogout}>
            ← Administrar
          </button>

          <button
            type="button"
            onClick={logout}
            style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
            disabled={busyLogout}
            title="Cerrar sesión"
          >
            {busyLogout ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={ui.main}>
        <div style={ui.container}>
          {/* Hero */}
          <div style={ui.hero}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Historial</div>
                <span style={ui.badge}>Finalizadas</span>
              </div>

              <h1 style={ui.title}>Aperturas finalizadas</h1>
              <p style={ui.subtitle}>
                Buscá, filtrá por tipo/mes/año y ordená por fecha o nombre.
              </p>
            </div>

            <div style={ui.heroSide}>
              <div style={ui.quickCard}>
                <div style={ui.quickLabel}>Resumen</div>
                <div style={ui.quickMetaRow}>
                  <span style={ui.chipSoft}>
                    🔒 {isLoading ? "Cargando…" : `Mostrando ${data.items.length} de ${data.total}`}
                  </span>
                  <span style={ui.chipSoft}>🗄️ Base: {data.baseTotal}</span>
                  <span style={ui.chipSoft}>🎛️ {filtrosLabel}</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    style={ui.btnGhost}
                    disabled={busyLogout}
                    title="Mostrar/ocultar filtros"
                  >
                    {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibleCount(10)}
                    style={ui.btnGhost}
                    disabled={busyLogout || isLoading}
                    title="Volver al inicio"
                  >
                    Reiniciar lista
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          {showFilters ? (
            <div style={ui.filterCard}>
              <div style={ui.filterGrid}>
                <div style={ui.inputWrap}>
                  <span style={ui.inputIcon}>🔎</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, tipo o número de marchamo…"
                    style={ui.input}
                  />
                </div>

                <div style={ui.selectWrap}>
                  <span style={ui.selectIcon}>⬚</span>
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

                <div style={ui.selectWrap}>
                  <span style={ui.selectIcon}>📅</span>
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

                <div style={ui.selectWrap}>
                  <span style={ui.selectIcon}>🗓️</span>
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

                <div style={ui.sortRow}>
                  <button
                    type="button"
                    onClick={() => setSortKey("fecha")}
                    style={{
                      ...ui.sortBtn,
                      ...(sortKey === "fecha" ? ui.sortBtnActive : {}),
                    }}
                  >
                    Recientes
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

              <div style={ui.filterFooter}>
                <button type="button" onClick={limpiarFiltros} style={ui.btnGhost} disabled={busyLogout}>
                  🧹 Limpiar filtros
                </button>
              </div>
            </div>
          ) : null}

          {/* List */}
          {isLoading ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIcon}>⏳</div>
              <div style={ui.emptyTitle}>Cargando…</div>
              <div style={ui.emptyText}>Un momento, por favor.</div>
            </div>
          ) : data.items.length === 0 ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIcon}>🔒</div>
              <div style={ui.emptyTitle}>No hay aperturas finalizadas</div>
              <div style={ui.emptyText}>No se encontraron aperturas con esos filtros.</div>
            </div>
          ) : (
            <>
              <div style={ui.listGrid}>
                {data.items.map((item, idx) => {
                  const cuando = item?.completedAt || item?.fecha || item?.createdAt;
                  const isHover = hovered === (item.id ?? idx);

                  return (
                    <div
                      key={String(item.id ?? idx)}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => setHovered(item.id ?? idx)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() =>
                        go(`/salud/aperturas/detalle/${encodeURIComponent(String(item.id ?? idx))}`)
                      }
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        go(`/salud/aperturas/detalle/${encodeURIComponent(String(item.id ?? idx))}`)
                      }
                      style={{
                        ...ui.itemCard,
                        ...(isHover ? ui.itemCardHover : {}),
                      }}
                      title="Ver detalle"
                    >
                      <div style={ui.itemTop}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={ui.itemTitle}>{item.nombre || "(Sin nombre)"}</div>
                          <div style={ui.itemSub}>
                            <span>{item.tipo || "—"}</span>
                            <span style={ui.dot}>·</span>
                            <span style={ui.muted}>{item.tipoFormulario || "Sin formulario"}</span>
                          </div>
                        </div>

                        <span style={ui.statePill}>🔒 Finalizada</span>
                      </div>

                      <div style={ui.itemChips}>
                        <span style={{ ...ui.smallPill, ...ui.smallPillOk }}>Completa</span>
                        <span style={ui.smallPill}>
                          👤 <b>{item.creadoPorNombre || "—"}</b>
                        </span>
                      </div>

                      <div style={ui.detailsBox}>
                        <div style={ui.detailLine}>
                          Fecha: <span style={ui.detailStrong}>{formatFecha(cuando)}</span>
                        </div>
                        <div style={ui.detailLine}>
                          Marchamo: <span style={ui.detailStrong}>{item.numeroMarchamo || "—"}</span>
                        </div>
                      </div>

                      <div style={ui.itemFooter}>
                        <span style={ui.link}>Ver detalle →</span>
                        <span style={ui.metaHint}>ID: {String(item.id ?? idx)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ display: "grid", placeItems: "center", paddingBottom: 18 }}>
                {hayMas ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 10)}
                    style={ui.loadMoreBtn}
                  >
                    ＋ Cargar 10 más
                  </button>
                ) : (
                  <span style={ui.endPill}>✅ No hay más resultados</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ui = {
  shell: {
    height: "100vh",
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
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(246,247,251,0.95) 100%)",
    backdropFilter: "blur(6px)",
  },

  brand: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" },
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

  topbarRight: { display: "flex", alignItems: "center", gap: 12 },

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
  },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed", boxShadow: "none" },

  main: { overflow: "auto", padding: 16, display: "grid", placeItems: "start center" },
  container: { width: "min(1100px, 100%)", display: "grid", gap: 14 },

  hero: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: 12,
    alignItems: "stretch",
  },

  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 4px rgba(8,159,138,0.14)",
  },
  kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase", color: ACCENT },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },

  title: { margin: 0, fontSize: 26, fontWeight: 980, letterSpacing: -0.3 },
  subtitle: { margin: 0, color: "#64748B", fontWeight: 800, lineHeight: 1.4 },

  heroSide: { display: "grid" },
  quickCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  quickLabel: { fontWeight: 980, color: "#0F172A", marginBottom: 10 },
  quickMetaRow: { display: "grid", gap: 10 },

  chipSoft: {
    fontSize: 12,
    fontWeight: 900,
    padding: "8px 10px",
    borderRadius: 14,
    background: "#fff",
    border: "1px solid #E7E9F2",
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
  },

  filterCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 12,
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },
  filterGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    alignItems: "center",
  },

  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "10px 12px",
    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
  },
  inputIcon: { fontSize: 14, opacity: 0.9 },
  input: {
    width: "100%",
    border: "none",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    background: "transparent",
  },

  selectWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
  },
  selectIcon: { fontSize: 14, opacity: 0.9 },
  select: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontWeight: 900,
    color: "#0F172A",
    cursor: "pointer",
  },

  sortRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  sortBtn: {
    flex: 1,
    minWidth: 160,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
  },
  sortBtnActive: { background: "#0F172A", color: "#fff", borderColor: "#0F172A" },

  filterFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #E7E9F2",
    display: "flex",
    justifyContent: "flex-end",
  },

  listGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  },

  itemCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },
  itemCardHover: { transform: "translateY(-2px)", boxShadow: "0 16px 36px rgba(15,23,42,0.12)" },

  itemTop: { display: "flex", gap: 10, alignItems: "flex-start" },
  itemTitle: { fontWeight: 980, fontSize: 15, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemSub: { marginTop: 4, color: "#334155", fontWeight: 850, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  dot: { margin: "0 6px", color: "#94A3B8" },
  muted: { color: "#94A3B8", fontWeight: 850 },

  statePill: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F2F4FB",
    fontWeight: 950,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },

  itemChips: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  smallPill: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    fontWeight: 900,
    fontSize: 12,
    color: "#0F172A",
  },
  smallPillOk: { background: "#EAF7EE", borderColor: "rgba(34,197,94,0.25)" },

  detailsBox: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #E7E9F2" },
  detailLine: { color: "#64748B", fontWeight: 850, fontSize: 13 },
  detailStrong: { color: "#0F172A", fontWeight: 980 },

  itemFooter: { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  link: { color: "#0F172A", fontWeight: 980, fontSize: 12 },
  metaHint: { color: "#94A3B8", fontWeight: 850, fontSize: 12 },

  loadMoreBtn: {
    borderRadius: 14,
    border: "1px solid #0F172A",
    background: "#0F172A",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 980,
    color: "#fff",
    boxShadow: "0 16px 40px rgba(15,23,42,0.14)",
  },
  endPill: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
  },

  emptyWrap: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    display: "grid",
    placeItems: "center",
    gap: 6,
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: 980, color: "#0F172A" },
  emptyText: { color: "#64748B", fontWeight: 850, textAlign: "center" },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    fontWeight: 980,
  },
  userName: { fontWeight: 980, fontSize: 12, color: "#0F172A", lineHeight: 1.1 },
  userMail: { fontWeight: 850, fontSize: 12, color: "#64748B", lineHeight: 1.1 },
};