// screens/AccionDescarga.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, User } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth, db } from "../../firebase";
import { filterByUserScope } from "../../utils/dataScope";
import imgAccionDescarga from "../../assets/accionDescarga.png";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

/* ===================== Helpers ===================== */
function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getEstado(item) {
  const completedAtValue = item?.completedAt ?? item?.completeAt;
  const started = !!item?.startedAt;
  const completed = !!completedAtValue;
  if (completed) return "Completada";
  if (started) return "En proceso";
  return "Pendiente";
}

function parseYMD(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function endOfDay(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDateTimeSafe(ts) {
  if (!ts) return "—";
  const d = typeof ts?.toDate === "function" ? ts.toDate() : toDateSafe(ts);
  if (!d) return "—";
  let s = d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  s = s.replace(/\u00A0/g, " ").trim();
  s = s
    .replace(/\bAM\b/i, "a. m.")
    .replace(/\bPM\b/i, "p. m.")
    .replace(/\ba\.m\.\b/i, "a. m.")
    .replace(/\bp\.m\.\b/i, "p. m.")
    .replace(/(\b[a-záéíóúñ]{3,})\./gi, "$1");
  return s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function dateToYMD(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ===================== Screen ===================== */
export default function AccionDescarga() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [hovered, setHovered] = useState(null);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  // filtros
  const [qText, setQText] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [fProveedor, setFProveedor] = useState("");
  const [fAnden, setFAnden] = useState("");
  const [fEstado, setFEstado] = useState("Todos");
  const [fDesde, setFDesde] = useState(""); // YYYY-MM-DD
  const [fHasta, setFHasta] = useState(""); // YYYY-MM-DD

  // “Sheet” (modal) filtros
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fecha: input type="date"
  const desdeRef = useRef(null);
  const hastaRef = useRef(null);

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

  // realtime
  useEffect(() => {
    if (authLoading) return;
    const q = query(collection(db, "accion_descarga"), orderBy("creadoAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = filterByUserScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          profile?.tenantId,
          profile?.company
        );
        setItems(rows);
        setLoading(false);
      },
      (err) => {
        console.log("accion_descarga onSnapshot error:", err);
        setItems([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [authLoading, profile?.tenantId, profile?.company]);

  // Debounce buscador
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(qText), 250);
    return () => clearTimeout(t);
  }, [qText]);

  // Conteo por estado (TOTAL)
  const estadoCounts = useMemo(() => {
    const counts = { Pendiente: 0, "En proceso": 0, Completada: 0 };
    for (const it of items) {
      const est = getEstado(it);
      if (counts[est] != null) counts[est] += 1;
    }
    return counts;
  }, [items]);

  // Filtrado final
  const filteredItems = useMemo(() => {
    const text = qDebounced.trim().toLowerCase();
    const prov = fProveedor.trim().toLowerCase();
    const anden = String(fAnden ?? "").trim();
    const desde = parseYMD(fDesde);
    const hasta = endOfDay(parseYMD(fHasta));

    return items.filter((it) => {
      const est = getEstado(it);
      if (fEstado !== "Todos" && est !== fEstado) return false;

      if (prov) {
        const p = String(it?.proveedorNombre ?? "").toLowerCase();
        if (!p.includes(prov)) return false;
      }

      if (anden) {
        const a = String(it?.idAnden ?? "").trim();
        if (a !== anden) return false;
      }

      const d = toDateSafe(it?.creadoAt);
      if (desde && (!d || d < desde)) return false;
      if (hasta && (!d || d > hasta)) return false;

      if (text) {
        const hay = [it?.proveedorNombre, it?.idAnden, it?.aperturaId]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" · ");
        if (!hay.includes(text)) return false;
      }

      return true;
    });
  }, [items, qDebounced, fProveedor, fAnden, fEstado, fDesde, fHasta]);

  const hasActiveFilters =
    fEstado !== "Todos" || !!qText || !!fProveedor || !!fAnden || !!fDesde || !!fHasta;

  const clearAll = () => {
    setQText("");
    setQDebounced("");
    setFProveedor("");
    setFAnden("");
    setFEstado("Todos");
    setFDesde("");
    setFHasta("");
  };

  const toggleEstado = (estado) => {
    setFEstado((prev) => (prev === estado ? "Todos" : estado));
  };

  const openFilters = () => setFiltersOpen(true);
  const closeFilters = () => setFiltersOpen(false);

  const onCardOpen = (id) => {
    // Ajustá esta ruta según tu router
    nav(`/recepcion/accion-descarga/${id}`);
  };

  /* ===================== UI Parts ===================== */
  const TopStickyHeader = () => (
    <div style={ui.stickyWrap}>
      {/* Chips estado */}
      <div style={ui.chipsRow}>
        {["Pendiente", "En proceso", "Completada"].map((x) => {
          const selected = fEstado === x;
          const n = estadoCounts?.[x] ?? 0;

          return (
            <button
              key={x}
              type="button"
              onClick={() => toggleEstado(x)}
              style={{ ...ui.chip, ...(selected ? ui.chipOn : {}) }}
            >
              <span style={{ ...ui.chipTxt, ...(selected ? ui.chipTxtOn : {}) }}>
                {x} ({n})
              </span>
            </button>
          );
        })}
      </div>

      {/* Summary bar */}
      <div style={ui.summaryBar}>
        <div style={ui.summaryTxt} title="Resumen">
          {fEstado !== "Todos"
            ? `Filtro: ${fEstado} · ${filteredItems.length} resultados`
            : `Mostrando ${filteredItems.length} resultados`}
        </div>

        {hasActiveFilters ? (
          <button type="button" style={ui.summaryBtn} onClick={clearAll}>
            <span style={ui.summaryBtnTxt}>Limpiar</span>
          </button>
        ) : (
          <button type="button" style={ui.summaryBtn} onClick={openFilters}>
            <span style={ui.summaryBtnTxt}>Filtros</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div style={ui.searchRow}>
        <div style={ui.searchIcon}>⌕</div>

        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Buscar proveedor, andén, apertura…"
          style={ui.searchInput}
        />

        {qText ? (
          <button
            type="button"
            title="Borrar"
            style={ui.searchClearBtn}
            onClick={() => {
              setQText("");
              setQDebounced("");
            }}
          >
            ×
          </button>
        ) : (
          <div style={{ width: 34 }} />
        )}
      </div>
    </div>
  );

  const Empty = () => (
    <div style={ui.emptyWrap}>
      <div style={ui.emptyTitle}>No hay acciones</div>
      <div style={ui.emptyText}>Probá quitando filtros o revisá más tarde.</div>

      <button type="button" style={ui.emptyBtn} onClick={clearAll}>
        <span style={ui.emptyBtnTxt}>Limpiar filtros</span>
      </button>
    </div>
  );

  const RowCard = ({ item }) => {
    const proveedor = item?.proveedorNombre || "(sin proveedor)";
    const anden = item?.idAnden || "—";
    const titulo = `${proveedor} · Andén ${anden}`;

    const creadoPor = item?.creadoPorNombre || "—";
    const aperturaId = item?.aperturaId || "—";
    const fecha = formatDateTimeSafe(item?.creadoAt);

    const estado = getEstado(item);
    const tipo = item?.tipoDescarga || "—";
    const bultos = item?.cantidadBultos ? String(item.cantidadBultos) : "—";
    const dur = item?.totalTimeTxt || "—";

    const pillStyle =
      estado === "Completada"
        ? ui.estadoPillOk
        : estado === "En proceso"
        ? ui.estadoPillWarn
        : ui.estadoPillNeutral;

    const isHover = hovered === item.id;

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onCardOpen(item.id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onCardOpen(item.id)}
        onMouseEnter={() => setHovered(item.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          ...ui.rowCard,
          ...(isHover ? ui.rowCardHover : {}),
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={ui.rowTop}>
            <div style={ui.rowTitle} title={titulo}>
              {titulo}
            </div>

            <div style={{ ...ui.estadoPill, ...pillStyle }}>
              <span style={ui.estadoPillTxt}>{estado}</span>
            </div>
          </div>

          <div style={ui.rowDesc} title={`Creado por: ${creadoPor}`}>
            Creado por: {creadoPor}
          </div>

          <div style={ui.rowMeta} title={`${fecha} · Apertura: ${aperturaId}`}>
            {fecha} · Apertura: {aperturaId}
          </div>

          <div style={ui.rowExtra} title={`Tipo: ${tipo} · Bultos: ${bultos} · Tiempo: ${dur}`}>
            Tipo: {tipo} · Bultos: {bultos} · Tiempo: {dur}
          </div>
        </div>

        <div style={ui.rowChevron}>›</div>
      </div>
    );
  };

  /* ===================== Render ===================== */
  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div style={ui.brand} role="button" tabIndex={0} onClick={() => nav("/recepcion")}>
            <div style={ui.brandMark}>
              <Truck size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Acciones de Descarga</div>
              <div style={ui.brandSub}>Listado y filtros</div>
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

            <button type="button" onClick={() => nav("/recepcion")} style={ui.btnGhost} title="Volver">
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Recepción
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
          {/* Mini-hero */}
          <div style={ui.heroMini}>
            <div style={ui.heroMedia} aria-hidden="true">
              <div style={{ ...ui.heroMediaBg, backgroundImage: `url(${imgAccionDescarga})` }} />
              <div style={ui.heroMediaOverlay} />
              <div style={ui.heroMediaText}>
                <div style={ui.kickerRow}>
                  <span style={ui.kickerDot} />
                  <div style={ui.kicker}>Recepción</div>
                  <span style={ui.badge}>Acciones</span>
                </div>
                <div style={ui.titleMini}>Acciones de Descarga</div>
                <div style={ui.subtitleMini}>Buscá, filtrá y abrí acciones en tiempo real.</div>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={ui.center}>
              <div style={ui.spinner} aria-label="Cargando" />
              <div style={ui.loadingText}>Cargando acciones…</div>
            </div>
          ) : (
            <div style={ui.listWrap}>
              <TopStickyHeader />

              {filteredItems.length === 0 ? (
                <Empty />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredItems.map((it) => (
                    <RowCard key={it.id} item={it} />
                  ))}
                </div>
              )}

              <div style={ui.listBottomHint}>
                Mostrando {filteredItems.length} de {items.length}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===== Modal filtros ===== */}
      {filtersOpen && (
        <div style={ui.modalRoot} role="dialog" aria-modal="true">
          <button type="button" style={ui.modalBackdrop} onClick={closeFilters} aria-label="Cerrar" />

          <div style={ui.sheet}>
            <div style={ui.sheetHeader}>
              <div style={ui.sheetTitle}>Filtros</div>
              <button type="button" onClick={closeFilters} style={ui.sheetCloseBtn}>
                Cerrar
              </button>
            </div>

            <div style={ui.sheetGrid}>
              <div style={ui.field}>
                <div style={ui.label}>Proveedor</div>
                <input
                  value={fProveedor}
                  onChange={(e) => setFProveedor(e.target.value)}
                  placeholder="Ej: Rimax"
                  style={ui.input}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.label}>Andén</div>
                <input
                  value={fAnden}
                  onChange={(e) => setFAnden(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Ej: 3"
                  inputMode="numeric"
                  style={ui.input}
                />
              </div>

              <div style={ui.dateRow}>
                <div style={ui.field}>
                  <div style={ui.label}>Desde</div>
                  <div style={ui.dateBtnWrap}>
                    <input
                      ref={desdeRef}
                      type="date"
                      value={fDesde}
                      onChange={(e) => setFDesde(e.target.value)}
                      style={ui.dateInput}
                    />
                    <button
                      type="button"
                      style={ui.dateBtn}
                      onClick={() => desdeRef.current?.showPicker?.() || desdeRef.current?.click?.()}
                      title="Seleccionar fecha"
                    >
                      {fDesde || "Seleccionar"}
                    </button>
                  </div>
                </div>

                <div style={ui.field}>
                  <div style={ui.label}>Hasta</div>
                  <div style={ui.dateBtnWrap}>
                    <input
                      ref={hastaRef}
                      type="date"
                      value={fHasta}
                      onChange={(e) => setFHasta(e.target.value)}
                      style={ui.dateInput}
                    />
                    <button
                      type="button"
                      style={ui.dateBtn}
                      onClick={() => hastaRef.current?.showPicker?.() || hastaRef.current?.click?.()}
                      title="Seleccionar fecha"
                    >
                      {fHasta || "Seleccionar"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={ui.sheetActions}>
                <button type="button" style={ui.secondaryBtn} onClick={clearAll}>
                  Limpiar
                </button>

                <button
                  type="button"
                  style={ui.primaryBtn}
                  onClick={() => {
                    closeFilters();
                  }}
                >
                  Aplicar
                </button>
              </div>

              <div style={ui.sheetHint}>
                Mostrando {filteredItems.length} de {items.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== Styles (corporativo) ===================== */
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
    minWidth: 0,
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
  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "18px 16px 28px",
    display: "grid",
    placeItems: "start center",
    WebkitOverflowScrolling: "touch",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 14,
  },

  /* Mini hero */
  heroMini: { display: "grid" },
  heroMedia: {
    position: "relative",
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    minHeight: 150,
  },
  heroMediaBg: { position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center" },
  heroMediaOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.70) 100%)",
  },
  heroMediaText: {
    position: "relative",
    padding: 16,
    display: "grid",
    gap: 8,
    color: "#fff",
  },

  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 4px rgba(8,159,138,0.14)",
  },
  kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase", color: "#E9FFFB" },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.35)",
    color: "#fff",
    backdropFilter: "blur(6px)",
  },

  titleMini: { fontSize: 22, fontWeight: 980, letterSpacing: -0.2 },
  subtitleMini: { color: "rgba(255,255,255,0.84)", fontWeight: 850, lineHeight: 1.35 },

  center: { minHeight: 320, display: "grid", placeItems: "center", gap: 10 },
  spinner: {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "3px solid rgba(15,23,42,0.12)",
    borderTopColor: ACCENT,
    animation: "spin 0.9s linear infinite",
  },
  loadingText: { color: "#64748B", fontWeight: 850 },

  listWrap: { display: "grid", gap: 12 },

  /* Sticky header */
  stickyWrap: {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#F6F7FB",
    paddingBottom: 12,
  },

  chipsRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 },

  chip: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "8px 10px",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
  },
  chipOn: { background: "#0F172A", borderColor: "#0F172A" },
  chipTxt: { fontWeight: 950, fontSize: 12, color: "#0F172A" },
  chipTxtOn: { color: "#fff" },

  summaryBar: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    padding: 12,
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  summaryTxt: { flex: 1, color: "#64748B", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis" },

  summaryBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
  },
  summaryBtnTxt: { fontWeight: 950, color: "#0F172A", fontSize: 12 },

  searchRow: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    padding: "10px 10px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  searchIcon: { width: 22, textAlign: "center", color: "#94A3B8", fontWeight: 950 },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    background: "transparent",
  },
  searchClearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 950,
    color: "#64748B",
  },

  /* Cards list */
  rowCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #E7E9F2",
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 92,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  rowCardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)",
  },

  rowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: 980,
    flex: 1,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  rowDesc: { color: "#64748B", marginTop: 4, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis" },
  rowMeta: { color: "#94A3B8", marginTop: 6, fontSize: 12, fontWeight: 850 },
  rowExtra: { color: "#64748B", marginTop: 6, fontSize: 12, fontWeight: 900 },

  rowChevron: { fontSize: 26, fontWeight: 980, color: "#94A3B8", paddingLeft: 6 },

  estadoPill: { padding: "6px 10px", borderRadius: 999, border: "1px solid #E7E9F2", background: "#F2F4FB" },
  estadoPillNeutral: { backgroundColor: "#F2F4FB", borderColor: "#E7E9F2" },
  estadoPillWarn: { backgroundColor: "#FFF4DF", borderColor: "#FFE1A8" },
  estadoPillOk: { backgroundColor: "#EAF7EE", borderColor: "#C6EAD2" },
  estadoPillTxt: { fontSize: 12, fontWeight: 950, color: "#334155" },

  /* Empty */
  emptyWrap: {
    padding: 16,
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    backgroundColor: "#FBFCFF",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  emptyTitle: { color: "#0F172A", fontWeight: 980, fontSize: 14 },
  emptyText: { color: "#64748B", marginTop: 6, fontWeight: 850, fontSize: 13, lineHeight: 1.35 },
  emptyBtn: {
    marginTop: 12,
    borderRadius: 14,
    padding: "12px 12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #E7E9F2",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontWeight: 950,
  },
  emptyBtnTxt: { fontWeight: 950, color: "#0F172A" },

  listBottomHint: { color: "#94A3B8", fontWeight: 850, fontSize: 12, paddingTop: 4, paddingBottom: 10 },

  /* Modal / sheet */
  modalRoot: { position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "end center" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", border: "none" },

  sheet: {
    width: "min(720px, 100%)",
    background: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 -18px 60px rgba(15,23,42,0.22)",
    padding: 16,
    margin: 12,
  },

  sheetHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: 980, color: "#0F172A" },
  sheetCloseBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
  },

  sheetGrid: { display: "grid", gap: 12 },

  field: { display: "grid", gap: 6 },
  label: { color: "#64748B", fontWeight: 950, fontSize: 12 },
  input: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "12px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
  },

  dateRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

  dateBtnWrap: { position: "relative" },
  dateInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    pointerEvents: "none",
  },
  dateBtn: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "12px 12px",
    cursor: "pointer",
    fontWeight: 900,
    color: "#0F172A",
    textAlign: "left",
  },

  sheetActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 },

  secondaryBtn: {
    borderRadius: 14,
    padding: "12px 12px",
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
    fontWeight: 980,
    color: "#0F172A",
  },

  primaryBtn: {
    borderRadius: 14,
    padding: "12px 12px",
    border: "1px solid rgba(8,159,138,0.35)",
    backgroundColor: ACCENT,
    cursor: "pointer",
    fontWeight: 980,
    color: "#fff",
  },

  sheetHint: { marginTop: 10, color: "#64748B", fontWeight: 850, fontSize: 12 },

  /* NOTE: animación spinner (CSS) */
  // Si usás CSS global, podés mover esto. Acá lo dejamos como recordatorio:
  // @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
};