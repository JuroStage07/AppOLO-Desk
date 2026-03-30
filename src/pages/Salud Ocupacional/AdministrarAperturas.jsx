// screens/aperturas/AdministrarAperturas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Loader2,
  LogOut,
  User,
} from "lucide-react";
import { auth } from "../../firebase";

import imgProceso from "../../assets/aperturas.png";
import imgFinalizadas from "../../assets/revisionEquipos.png";
import imgRechazadas from "../../assets/ingresoTerceros.png";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

function formatFecha() {
  try {
    return new Date().toLocaleDateString("es-CR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return new Date().toLocaleDateString();
  }
}

export default function AdministrarAperturas() {
  const nav = useNavigate();
  const user = auth.currentUser;

  const [busyLogout, setBusyLogout] = useState(false);
  const [hovered, setHovered] = useState(null);

  const [countProceso] = useState(0);
  const [countRechazadas] = useState(0);

  const fechaHoy = useMemo(() => formatFecha(), []);

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

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const go = (path) => nav(path);

  const moduleMeta = {
    proceso: { status: "LISTO", tone: "accent" },
    finalizadas: { status: "LISTO", tone: "neutral" },
    rechazadas: { status: "LISTO", tone: "neutral" },
  };

  const statusLabel = (s) => {
    if (s === "LISTO") return "Listo";
    if (s === "PROX") return "Próximamente";
    if (s === "BETA") return "Beta";
    return s || "Módulo";
  };

  const modules = useMemo(
    () => [
      {
        key: "proceso",
        title: "En proceso",
        desc: "Aperturas activas actualmente.",
        path: "/salud/aperturas/proceso",
        tone: "accent",
        img: imgProceso,
        tag: "Prioritario",
        badge: countProceso,
      },
      {
        key: "finalizadas",
        title: "Finalizadas",
        desc: "Historial de aperturas cerradas.",
        path: "/salud/aperturas/finalizadas",
        tone: "neutral",
        img: imgFinalizadas,
        tag: "Historial",
      },
      {
        key: "rechazadas",
        title: "Rechazadas",
        desc: "Aperturas marcadas como rechazadas.",
        path: "/salud/aperturas/rechazadas",
        tone: "neutral",
        img: imgRechazadas,
        tag: "Control",
        badge: countRechazadas,
      },
    ],
    [countProceso, countRechazadas]
  );

  return (
    <div style={ui.shell}>
      <style>{`
        @keyframes adminAperturasSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/salud/aperturas")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/salud/aperturas")}
          >
            <div style={ui.brandMark}>
              <ClipboardList size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Aperturas</div>
              <div style={ui.brandSub}>Administrar</div>
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

            <button type="button" onClick={() => go("/salud")} style={ui.btnGhost} disabled={busyLogout}>
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Menú Salud
              </span>
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
              title="Cerrar sesión"
            >
              <span style={ui.btnInlineIcon}>
                {busyLogout ? (
                  <Loader2
                    size={16}
                    strokeWidth={2.2}
                    style={{ animation: "adminAperturasSpin 0.7s linear infinite" }}
                  />
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
          <section style={ui.hero}>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <span style={ui.kicker}>Gestión</span>
                <span style={ui.badge}>{fechaHoy}</span>
              </div>

              <h1 style={ui.title}>Administrar aperturas</h1>
              <p style={ui.subtitle}>Elegí una categoría para ver la lista y gestionar el flujo.</p>

              <div style={ui.chipsRow}>
                <span style={ui.chipSoft}>
                  En proceso: <b>{countProceso}</b>
                </span>
                <span style={ui.chipSoft}>
                  Rechazadas: <b>{countRechazadas}</b>
                </span>
              </div>
            </div>

            <div style={ui.quickCard}>
              <div style={ui.quickLabel}>Acceso rápido</div>
              <div style={ui.quickBtns}>
                <button
                  type="button"
                  onClick={() => go("/salud/aperturas/proceso")}
                  style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                  disabled={busyLogout}
                >
                  Ir a en proceso
                </button>
                <button
                  type="button"
                  onClick={() => go("/salud/aperturas/rechazadas")}
                  style={ui.quickBtn}
                  disabled={busyLogout}
                >
                  Ver rechazadas
                </button>
              </div>
            </div>
          </section>

          <div style={ui.grid}>
            {modules.map((m) => {
              const isHover = hovered === m.key;
              const accent = m.tone === "accent";
              const meta = moduleMeta[m.key];

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
                  <div style={{ ...ui.media, backgroundImage: `url(${m.img})` }}>
                    <div style={ui.mediaOverlay} />
                    <div style={ui.mediaTop}>
                      <span style={{ ...ui.pill, ...(accent ? ui.pillAccent : {}) }}>{m.tag}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {typeof m.badge === "number" ? (
                          <span style={ui.countPill}>{m.badge}</span>
                        ) : null}
                        <span
                          style={{
                            ...ui.statusPill,
                            ...(meta?.status === "LISTO" ? ui.statusOk : ui.statusProx),
                          }}
                        >
                          {statusLabel(meta?.status)}
                        </span>
                      </div>
                    </div>
                  </div>

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
              Si algo no abre, revisá rutas y permisos (<b>permisos.saludOcupacional</b>).
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
  btnInlineIcon: { display: "inline-flex", alignItems: "center", gap: 8 },
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

  chipsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  chipSoft: {
    fontSize: 12,
    fontWeight: 800,
    padding: "8px 12px",
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #E7E9F2",
    color: "#0F172A",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
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
  },
  pillAccent: {
    borderColor: "rgba(255,255,255,0.45)",
    background: "rgba(8,159,138,0.28)",
  },

  countPill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.16)",
    color: "#fff",
    fontWeight: 950,
    fontSize: 11,
    backdropFilter: "blur(6px)",
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
  },
  statusOk: { background: "rgba(8,159,138,0.30)" },
  statusProx: { background: "rgba(148,163,184,0.26)" },

  cardBody: { padding: 16 },
  cardTitle: { fontWeight: 950, fontSize: 16, color: "#0F172A", marginBottom: 6 },
  cardDesc: { color: SLATE, fontWeight: 650, fontSize: 13, lineHeight: 1.45, minHeight: 36 },

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
