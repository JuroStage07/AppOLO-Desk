import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import {
  ArrowRight,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  User,
} from "lucide-react";
import { auth } from "../firebase";

// ✅ poné tus imágenes aquí:
import imgSalud from "../assets/saludOcupacional.png";
import imgDespacho from "../assets/despacho.png";
import imgMantenimiento from "../assets/mantenimiento.png";
import imgRecepcion from "../assets/recepcion.png";
import imgServiciosGenerales from "../assets/serviciosGenerales.png";
import imgEpa from "../assets/epalogo.jpeg";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function Home() {
  const nav = useNavigate();
  const { profile } = useContext(AuthCtx);
  const user = auth.currentUser;
  const [hovered, setHovered] = useState(null);
  const [busyLogout, setBusyLogout] = useState(false);

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

  const go = (path) => nav(path);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const allAreas = useMemo(
    () => [
      {
        key: "despacho",
        title: "Despacho",
        desc: "Gestión de despachos, carga y control operativo. Elegí en curso o historial finalizados.",
        // /despacho → pages/Despacho/Despacho.jsx (hub de módulos)
        path: "/despacho",
        img: imgDespacho,
        tag: "Operación",
        blocked: true,
        blockedDesc: "Acceso al módulo deshabilitado temporalmente.",
      },
      {
        key: "salud",
        title: "Salud Ocupacional",
        desc: "Control de terceros, visados y registros.",
        path: "/salud",
        img: imgSalud,
        tag: "Seguridad",
        tone: "accent",
      },
      {
        key: "recepcion",
        title: "Recepción",
        desc: "Recepción, validaciones y flujo de ingreso.",
        path: "/recepcion",
        img: imgRecepcion,
        tag: "Inbound",
      },
      {
        key: "mantenimiento",
        title: "Mantenimiento",
        desc: "Equipos, checklists, fallas y seguimiento.",
        path: "/mantenimiento",
        img: imgMantenimiento,
        tag: "Mantenimiento",
      },
      {
        key: "servicios-generales",
        title: "Servicios Generales",
        desc: "Gestión operativa, seguimiento y control de servicios generales.",
        path: "/servicios-generales",
        img: imgServiciosGenerales, // cambiá esta imagen si luego creás una propia
        tag: "Servicios",
      },
      {
        key: "epa",
        title: "EPA",
        desc: "Área de trabajo EPA.",
        path: "/epa",
        img: imgEpa,
        tag: "EPA",
        // Logo horizontal: contain evita recortes; fondo alineado al arte
        mediaStyle: {
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundColor: "#eef2f6",
        },
        mediaOverlayStyle: {
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.06) 0%, rgba(15,23,42,0.18) 100%)",
        },
        pillExtra: {
          border: "1px solid rgba(15,23,42,0.1)",
          background: "rgba(255,255,255,0.92)",
          color: "#0F172A",
          backdropFilter: "blur(6px)",
        },
      },
    ],
    []
  );

  const areas = useMemo(() => {
    if (profile?.epaAdmin === true) {
      return allAreas.filter((a) => a.key === "epa");
    }
    return allAreas;
  }, [allAreas, profile?.epaAdmin]);

  return (
    <div style={ui.shell}>
      <style>{`
        @keyframes homeSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/")}
          >
            <div style={ui.brandMark}>
              <LayoutDashboard size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={ui.brandTitle}>AppoloDesk</div>
              <div style={ui.brandSub}>Panel principal</div>
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
                    style={{ animation: "homeSpin 0.7s linear infinite" }}
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
                <span style={ui.kicker}>Centro de control</span>
                <span style={ui.badge}>
                  <Lock size={12} strokeWidth={2.5} style={{ marginRight: 5 }} />
                  Operación
                </span>
              </div>

              <h1 style={ui.title}>Áreas de trabajo</h1>
              <p style={ui.subtitle}>
                Seleccioná un área para continuar. El acceso depende de los permisos de tu cuenta.
              </p>
            </div>

            <div style={ui.statsRow}>
              <div style={ui.statCard}>
                <div style={ui.statCardLabel}>Módulos</div>
                <div style={ui.statCardValue}>{areas.length}</div>
                <div style={ui.statCardMeta}>áreas en el panel</div>
              </div>
              <div style={ui.statCard}>
                <div style={ui.statCardLabel}>Sesión</div>
                <div style={ui.statCardValue} title={user?.email || ""}>
                  {user?.email ? "Activa" : "—"}
                </div>
                <div style={ui.statCardMeta}>
                  {user?.email ? "Firebase Auth" : "Sin correo"}
                </div>
              </div>
            </div>
          </section>

          <div style={ui.grid}>
            {areas.map((a) => {
              const isHover = hovered === a.key;
              const accent = a.tone === "accent";
              const blocked = a.blocked === true;

              return (
                <div
                  key={a.key}
                  role={blocked ? "group" : "button"}
                  aria-disabled={blocked ? true : undefined}
                  tabIndex={blocked ? -1 : 0}
                  onClick={() => {
                    if (!blocked) go(a.path);
                  }}
                  onKeyDown={(e) => {
                    if (blocked) return;
                    if (e.key === "Enter" || e.key === " ") go(a.path);
                  }}
                  onMouseEnter={() => !blocked && setHovered(a.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...ui.card,
                    ...(accent && !blocked ? ui.cardAccent : {}),
                    ...(isHover && !blocked ? ui.cardHover : {}),
                    ...(blocked ? ui.cardBlocked : {}),
                  }}
                >
                  <div
                    style={{
                      ...ui.media,
                      backgroundImage: `url(${a.img})`,
                      ...(a.mediaStyle || {}),
                    }}
                  >
                    <div
                      style={{
                        ...ui.mediaOverlay,
                        ...(a.mediaOverlayStyle || {}),
                      }}
                    />
                    <div style={ui.mediaTop}>
                      <span
                        style={{
                          ...ui.pill,
                          ...(accent ? ui.pillAccent : {}),
                          ...(a.pillExtra || {}),
                        }}
                      >
                        {a.tag}
                      </span>
                      {blocked ? (
                        <span style={ui.pillBlocked}>
                          <Lock size={11} strokeWidth={2.5} style={{ marginRight: 5 }} />
                          Bloqueado
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={ui.cardBody}>
                    <div style={ui.cardTitle}>{a.title}</div>
                    <div style={ui.cardDesc}>{blocked ? a.blockedDesc || a.desc : a.desc}</div>

                    <div style={ui.cardFooter}>
                      {blocked ? (
                        <span style={ui.linkBlocked}>
                          <span style={ui.btnInlineIcon}>
                            <Lock size={14} strokeWidth={2.5} />
                            No disponible
                          </span>
                        </span>
                      ) : (
                        <span style={{ ...ui.link, ...(accent ? ui.linkAccent : {}) }}>
                          <span style={ui.btnInlineIcon}>
                            Entrar
                            <ArrowRight size={14} strokeWidth={2.5} />
                          </span>
                        </span>
                      )}
                      <span style={{ ...ui.metaHint, ...(blocked ? ui.metaHintBlocked : {}) }}>
                        {blocked ? "—" : a.path}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
    gap: 6,
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
  statCardMeta: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    lineHeight: 1.35,
    marginTop: 6,
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
  cardBlocked: {
    cursor: "not-allowed",
    opacity: 0.88,
    filter: "grayscale(0.25)",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
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
  pillBlocked: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "rgba(15,23,42,0.45)",
    color: "#fff",
    fontWeight: 950,
    fontSize: 11,
    backdropFilter: "blur(6px)",
    display: "inline-flex",
    alignItems: "center",
    marginLeft: "auto",
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
  linkBlocked: {
    color: SLATE,
    fontWeight: 800,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    cursor: "not-allowed",
  },
  metaHint: { color: "#94A3B8", fontWeight: 700, fontSize: 12 },
  metaHintBlocked: { opacity: 0.65 },
};
