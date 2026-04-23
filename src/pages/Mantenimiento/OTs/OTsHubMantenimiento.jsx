import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  LogOut,
  User,
  Wrench,
} from "lucide-react";
import { auth } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";

import imgEquipos from "../../../assets/revisionEquipos.png";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

/**
 * Hub intermedio: desde Mantenimiento → Ordenes de trabajo.
 * Gestión de OT → tablero (OTsPage). OT Finalizadas → listado cerradas.
 */
export default function OTsHubMantenimiento() {
  const nav = useNavigate();
  const { user, permisos, loading } = useContext(AuthCtx);

  const [busyLogout, setBusyLogout] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!permisos?.mantenimiento) {
      alert("Este usuario no puede acceder por falta de permisos.");
      nav(-1);
    }
  }, [loading, permisos, nav]);

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

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "dashboard",
        title: "Dashboard OTs",
        desc: "Métricas por período: volumen, estados, líderes y días de baja demanda.",
        path: "/mantenimiento/ots/dashboard",
        img: imgEquipos,
        tag: "OT",
        status: "Listo",
        tone: "accent",
      },
      {
        key: "gestion",
        title: "Gestión de OT",
        desc: "Tablero: pendientes, en proceso y en revisión. Arrastrá y asigná responsables.",
        path: "/mantenimiento/OTsPage",
        img: imgEquipos,
        tag: "OT",
        status: "Listo",
        tone: "accent",
      },
      {
        key: "finalizadas",
        title: "OT finalizadas",
        desc: "Órdenes de trabajo ya cerradas o finalizadas para consulta.",
        path: "/mantenimiento/ots/finalizadas",
        img: imgEquipos,
        tag: "OT",
        status: "Listo",
        tone: "muted",
      },
    ],
    []
  );

  if (!permisos?.mantenimiento) return null;

  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/mantenimiento")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/mantenimiento")}
          >
            <div style={ui.brandMark}>
              <Wrench size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Mantenimiento</div>
              <div style={ui.brandSub}>Órdenes de trabajo</div>
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

            <button type="button" onClick={() => go("/mantenimiento")} style={ui.btnGhost} disabled={busyLogout}>
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Mantenimiento
              </span>
            </button>

            <button type="button" onClick={() => go("/")} style={ui.btnGhost} disabled={busyLogout}>
              Inicio
            </button>

            <button
              type="button"
              onClick={logout}
              style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
              disabled={busyLogout}
              title="Cerrar sesión"
            >
              <span style={ui.btnInlineIcon}>
                {busyLogout ? (
                  <Loader2 size={16} strokeWidth={2.2} style={{ animation: "otsHubSpin 0.7s linear infinite" }} />
                ) : (
                  <LogOut size={16} strokeWidth={2.2} />
                )}
                {busyLogout ? "Cerrando…" : "Salir"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
          <div style={ui.hero}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Centro de control</div>
                <span style={ui.badge}>Órdenes de trabajo</span>
              </div>

              <h1 style={ui.title}>Submódulos</h1>
              <p style={ui.subtitle}>
                Elegí si trabajás el tablero operativo o consultás OT ya finalizadas.
              </p>
            </div>

            <div style={ui.heroSide}>
              <div style={ui.quickCard}>
                <div style={ui.quickLabel}>Acceso rápido</div>
                <div style={ui.quickBtns}>
                  <button
                    type="button"
                    onClick={() => go("/mantenimiento/ots/dashboard")}
                    style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                    disabled={busyLogout}
                  >
                    Dashboard OTs
                  </button>
                  <button
                    type="button"
                    onClick={() => go("/mantenimiento/OTsPage")}
                    style={ui.quickBtn}
                    disabled={busyLogout}
                  >
                    Gestión de OT (tablero)
                  </button>

                  <button
                    type="button"
                    onClick={() => go("/mantenimiento/ots/finalizadas")}
                    style={ui.quickBtn}
                    disabled={busyLogout}
                  >
                    OT finalizadas
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={ui.grid}>
            {modules.map((m) => {
              const isHover = hovered === m.key;
              const accent = m.tone === "accent";

              return (
                <div
                  key={m.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => go(m.path)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && go(m.path)
                  }
                  onMouseEnter={() => setHovered(m.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...ui.moduleCard,
                    ...(accent ? ui.moduleCardAccent : {}),
                    ...(isHover ? ui.moduleCardHover : {}),
                  }}
                >
                  <div
                    style={{
                      ...ui.media,
                      backgroundImage: `url(${m.img})`,
                    }}
                  >
                    <div style={ui.mediaOverlay} />

                    <div style={ui.mediaTop}>
                      <span
                        style={{
                          ...ui.pill,
                          ...(accent ? ui.pillAccent : {}),
                        }}
                      >
                        {m.tag}
                      </span>
                      <span style={{ ...ui.statusPill, ...ui.statusOk }}>
                        {m.status}
                      </span>
                    </div>
                  </div>

                  <div style={ui.cardBody}>
                    <div style={ui.cardTitle}>{m.title}</div>
                    <div style={ui.cardDesc}>{m.desc}</div>

                    <div style={ui.cardFooter}>
                      <span
                        style={{
                          ...ui.link,
                          ...(accent ? ui.linkAccent : {}),
                        }}
                      >
                        <span style={ui.btnInlineIcon}>
                          Entrar
                          <ArrowRight size={14} strokeWidth={2.5} />
                        </span>
                      </span>
                      <span style={ui.metaHint}>Ruta: {m.path}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={ui.footerNote}>
            <div style={ui.footerTitle}>Tip</div>
            <div style={ui.footerText}>
              El tablero sigue en <b>/mantenimiento/OTsPage</b>. Las finalizadas usan{" "}
              <b>OTState: &quot;Finalizada&quot;</b> en Firestore cuando cierres el
              flujo desde la app.
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes otsHubSpin { to { transform: rotate(360deg); } }
      `}</style>
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
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

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

  hero: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: 12,
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

  title: { margin: 0, fontSize: 26, fontWeight: 980, letterSpacing: -0.3 },
  subtitle: {
    margin: 0,
    color: SLATE,
    fontWeight: 800,
    lineHeight: 1.4,
  },

  heroSide: { display: "grid" },
  quickCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  quickLabel: { fontWeight: 980, color: "#0F172A", marginBottom: 10 },
  quickBtns: { display: "grid", gap: 10 },
  quickBtn: {
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "12px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    textAlign: "left",
  },
  quickBtnAccent: {
    borderColor: "rgba(8,159,138,0.35)",
    background: "#F3FBF9",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 14,
  },

  moduleCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  moduleCardAccent: {
    borderColor: "rgba(8,159,138,0.35)",
    boxShadow: "0 12px 26px rgba(8, 159, 138, 0.10)",
  },
  moduleCardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)",
  },

  media: {
    height: 120,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "contain",
    position: "relative",
  },
  mediaOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.55) 100%)",
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
    fontWeight: 950,
    fontSize: 11,
    backdropFilter: "blur(6px)",
  },
  statusOk: { background: "rgba(8,159,138,0.30)" },

  cardBody: { padding: 16 },
  cardTitle: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 6,
  },
  cardDesc: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.35,
    minHeight: 38,
  },

  cardFooter: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  link: { color: "#0F172A", fontWeight: 980, fontSize: 12 },
  linkAccent: { color: ACCENT },
  metaHint: { color: "#94A3B8", fontWeight: 800, fontSize: 12 },

  footerNote: {
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: 14,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  footerTitle: { fontWeight: 980, color: "#0F172A", marginBottom: 6 },
  footerText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.4,
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
};
