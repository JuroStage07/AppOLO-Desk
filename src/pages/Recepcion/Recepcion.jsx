// screens/Recepcion.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardList,
  PackageOpen,
  Package,
  Truck,
} from "lucide-react";
import { auth } from "../../firebase";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function Recepcion() {
  const nav = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;

  const [hovered, setHovered] = useState(null);

  const canEPA =
    location?.state?.canEPA === true ||
    new URLSearchParams(location.search).get("canEPA") === "true";

  const canCofersa =
    location?.state?.canCofersa === true ||
    new URLSearchParams(location.search).get("canCofersa") === "true";

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

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "descarga",
        title: "Acciones de descarga",
        desc: "Registro y seguimiento de descargas",
        path: "/recepcion/accion-descarga",
        tone: "accent",
        img: null,
        icon: Truck,
        tag: "Operativo",
        show: true,
      },
      {
        key: "metricas",
        title: "Estadísticas",
        desc: "Panel de métricas de recepción",
        path: "/recepcion/metricas",
        tone: "accent",
        img: null,
        icon: BarChart3,
        tag: "Dashboard",
        show: true,
      },
      {
        key: "aperturas",
        title: "Aperturas",
        desc: "Gestión y seguimiento de aperturas de recepción",
        path: "/recepcion/aperturas",
        tone: "accent",
        img: null,
        icon: ClipboardList,
        tag: "Operativo",
        show: true,
      },
      {
        key: "epa",
        title: "Recepción EPA",
        desc: "Módulo de recepción EPA",
        path: "/recepcion/epa",
        tone: "neutral",
        img: null,
        icon: PackageOpen,
        tag: "Módulo",
        show: canEPA,
      },
      {
        key: "cofersa",
        title: "Recepción Cofersa",
        desc: "Recepción de mercadería Cofersa",
        path: "/recepcion/cofersa",
        tone: "neutral",
        img: null,
        icon: Package,
        tag: "Módulo",
        show: canCofersa,
      },
    ],
    [canEPA, canCofersa]
  );

  const visibleModules = modules.filter((m) => m.show);

  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/recepcion")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/recepcion")}
          >
            <div style={ui.brandMark}>
              <Truck size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Recepción</div>
              <div style={ui.brandSub}>Panel de módulos</div>
            </div>
          </div>

          <div style={ui.topbarRight}>
            {user ? (
              <div style={ui.userHint} title={user.email || ""}>
                {user.displayName || user.email || "Sesión activa"}
              </div>
            ) : null}
            <button type="button" onClick={() => go("/")} style={ui.btnGhost} title="Volver al inicio">
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Inicio
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
          <section style={ui.hero}>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <span style={ui.kicker}>Centro de control</span>
                <span style={{ ...ui.badge, ...ui.badgeInline }}>
                  <Package size={12} strokeWidth={2.5} style={{ marginRight: 5 }} />
                  Operación
                </span>
              </div>

              <h1 style={ui.title}>Módulos</h1>
              <p style={ui.subtitle}>Seleccioná el flujo que necesitás. Los permisos EPA/Cofersa condicionan algunas tarjetas.</p>
            </div>

            <div style={ui.quickCard}>
              <div style={ui.quickLabel}>Acceso rápido</div>
              <div style={ui.quickBtns}>
                <button
                  type="button"
                  onClick={() => go("/recepcion/accion-descarga")}
                  style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                >
                  Acciones de descarga
                </button>
                <button
                  type="button"
                  onClick={() => go("/recepcion/metricas")}
                  style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                >
                  Estadísticas
                </button>
                <button
                  type="button"
                  onClick={() => go("/recepcion/aperturas")}
                  style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                >
                  Aperturas
                </button>
                {(canEPA || canCofersa) && (
                  <button
                    type="button"
                    onClick={() => go(canEPA ? "/recepcion/epa" : "/recepcion/cofersa")}
                    style={ui.quickBtn}
                  >
                    Abrir recepción
                  </button>
                )}
              </div>
            </div>
          </section>

          <div style={ui.grid}>
            {visibleModules.map((m) => {
              const isHover = hovered === m.key;
              const accent = m.tone === "accent";
              const Icon = m.icon || Package;

              return (
                <div
                  key={m.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => go(m.path)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(m.path)}
                  onMouseEnter={() => setHovered(m.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...ui.card,
                    ...(accent ? ui.cardAccent : {}),
                    ...(isHover ? ui.cardHover : {}),
                  }}
                >
                  {m.img ? (
                    <div style={{ ...ui.media, backgroundImage: `url(${m.img})` }}>
                      <div style={ui.mediaOverlay} />
                      <div style={ui.mediaTop}>
                        <span style={{ ...ui.pill, ...(accent ? ui.pillAccent : {}) }}>{m.tag}</span>
                        <span style={{ ...ui.statusPill, ...ui.statusOk }}>
                          <CheckCircle2 size={12} strokeWidth={2.5} style={{ marginRight: 4 }} />
                          Listo
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={ui.simpleHeader}>
                      <div style={{ ...ui.iconBox, ...(accent ? ui.iconBoxAccent : {}) }}>
                        <Icon size={22} strokeWidth={2.2} color={accent ? ACCENT : SLATE} />
                      </div>
                      <div style={ui.simpleHeaderRight}>
                        <span style={{ ...ui.pillSolid, ...(accent ? ui.pillSolidAccent : {}) }}>{m.tag}</span>
                        <span style={{ ...ui.statusPillSolid, ...ui.statusOkSolid }}>Listo</span>
                      </div>
                    </div>
                  )}

                  <div style={ui.cardBody}>
                    <div style={ui.cardTitle}>{m.title}</div>
                    <div style={ui.cardDesc}>{m.desc}</div>

                    <div style={ui.cardFooter}>
                      <span style={{ ...ui.link, ...(accent ? ui.linkAccent : {}) }}>
                        <span style={ui.btnInlineIcon}>
                          Entrar
                          <ArrowRight size={14} strokeWidth={2.5} />
                        </span>
                      </span>
                      <span style={ui.metaHint}>{m.path}</span>
                    </div>
                  </div>
                </div>
              );
            })}

          </div>

          <div style={ui.footerNote}>
            <div style={ui.footerTitle}>Tip</div>
            <div style={ui.footerText}>
              Si un módulo no abre, revisá permisos de recepción en tu perfil y que la ruta esté habilitada en la app.
            </div>
          </div>
        </div>
      </main>
    </div>
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
  userHint: {
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    maxWidth: 200,
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
  btnInlineIcon: { display: "inline-flex", alignItems: "center", gap: 8 },

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
  },
  badgeInline: { display: "inline-flex", alignItems: "center" },

  title: { margin: 0, fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 950, letterSpacing: -0.4 },
  subtitle: {
    margin: 0,
    color: SLATE,
    fontWeight: 650,
    lineHeight: 1.5,
    fontSize: 14,
    maxWidth: 520,
  },

  quickCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: "14px 16px",
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    display: "grid",
    gap: 10,
  },
  quickLabel: { fontWeight: 900, fontSize: 13, color: "#0F172A" },
  quickBtns: { display: "grid", gap: 8 },
  quickBtn: {
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#0F172A",
    textAlign: "left",
    fontFamily: "inherit",
  },
  quickBtnAccent: { borderColor: "rgba(8,159,138,0.35)", background: "#F3FBF9" },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
    gap: 14,
  },

  card: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  cardAccent: {
    borderColor: "rgba(8,159,138,0.35)",
    boxShadow: "0 12px 26px rgba(8, 159, 138, 0.10)",
  },
  cardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)",
  },

  media: {
    height: 124,
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative",
  },
  mediaOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.55) 100%)",
  },
  mediaTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontWeight: 950,
    fontSize: 11,
    backdropFilter: "blur(6px)",
    display: "inline-flex",
    alignItems: "center",
  },
  pillAccent: {
    borderColor: "rgba(255,255,255,0.45)",
    background: "rgba(8,159,138,0.28)",
  },

  statusPill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 11,
    backdropFilter: "blur(6px)",
    display: "inline-flex",
    alignItems: "center",
  },
  statusOk: { background: "rgba(8,159,138,0.30)" },

  simpleHeader: {
    padding: 14,
    borderBottom: "1px solid #EEF0F7",
    background: "linear-gradient(180deg, #FBFCFF 0%, #fff 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#F1F5F9",
    border: "1px solid #E7E9F2",
  },
  iconBoxAccent: {
    background: ACCENT_SOFT,
    border: "1px solid rgba(8,159,138,0.25)",
  },
  simpleHeaderRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },

  pillSolid: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#0F172A",
    fontWeight: 800,
    fontSize: 11,
  },
  pillSolidAccent: {
    borderColor: "rgba(8,159,138,0.30)",
    background: "#F3FBF9",
    color: ACCENT,
  },

  statusPillSolid: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    fontWeight: 800,
    fontSize: 11,
  },
  statusOkSolid: {
    borderColor: "rgba(8,159,138,0.30)",
    background: ACCENT_SOFT,
    color: ACCENT,
  },

  cardBody: { padding: 16 },
  cardTitle: { fontWeight: 950, fontSize: 16, color: "#0F172A", marginBottom: 6 },
  cardDesc: { color: SLATE, fontWeight: 650, fontSize: 13, lineHeight: 1.45, minHeight: 40 },

  cardFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  link: { color: "#0F172A", fontWeight: 850, fontSize: 13, display: "inline-flex", alignItems: "center" },
  linkAccent: { color: ACCENT },
  metaHint: { color: "#94A3B8", fontWeight: 700, fontSize: 12 },

  footerNote: {
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    borderTop: `3px solid ${ACCENT_SOFT}`,
  },
  footerTitle: { fontWeight: 950, color: "#0F172A", marginBottom: 6, fontSize: 14 },
  footerText: { color: SLATE, fontWeight: 650, fontSize: 14, lineHeight: 1.5 },
};
