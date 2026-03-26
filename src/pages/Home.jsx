import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

// ✅ poné tus imágenes aquí:
import imgSalud from "../assets/saludOcupacional.png";
import imgDespacho from "../assets/despacho.png";
import imgMantenimiento from "../assets/mantenimiento.png";
import imgRecepcion from "../assets/recepcion.png";


const ACCENT = "#089F8A";

export default function Home() {
  const nav = useNavigate();
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

  const areas = useMemo(
    () => [
      {
        key: "despacho",
        title: "Despacho",
        desc: "Gestión de despachos, carga y control operativo.",
        path: "/despacho",
        img: imgDespacho,
        tag: "Operación",
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
    ],
    []
  ); 

  return (
    <div style={ui.shell}>
      {/* Topbar */}
      <div style={ui.topbar}>
        <div style={ui.brand} role="button" tabIndex={0} onClick={() => go("/")}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>AppoloDesk</div>
            <div style={ui.brandSub}>Panel principal</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <button
            type="button"
            onClick={logout}
            disabled={busyLogout}
            style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
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
            <div style={{ display: "grid", gap: 10 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Centro de control</div>
                <span style={ui.badge}>Operación</span>
              </div>

              <h1 style={ui.title}>Áreas de trabajo</h1>
              <p style={ui.subtitle}>
                Seleccioná un área para continuar. Acceso basado en permisos del usuario.
              </p>
            </div>
          </div>

          {/* Grid */}
          <div style={ui.grid}>
            {areas.map((a) => {
              const isHover = hovered === a.key;
              const accent = a.tone === "accent";

              return (
                <div
                  key={a.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => go(a.path)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(a.path)}
                  onMouseEnter={() => setHovered(a.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...ui.card,
                    ...(accent ? ui.cardAccent : {}),
                    ...(isHover ? ui.cardHover : {}),
                  }}
                >
                  {/* Imagen */}
                  <div
                    style={{
                      ...ui.media,
                      backgroundImage: `url(${a.img})`,
                    }}
                  >
                    <div style={ui.mediaOverlay} />
                    <div style={ui.mediaTop}>
                      <span style={{ ...ui.pill, ...(accent ? ui.pillAccent : {}) }}>{a.tag}</span>
                    </div>
                  </div>

                  {/* Contenido */}
                  <div style={ui.cardBody}>
                    <div style={ui.cardTitle}>{a.title}</div>
                    <div style={ui.cardDesc}>{a.desc}</div>

                    <div style={ui.cardFooter}>
                      <span style={{ ...ui.link, ...(accent ? ui.linkAccent : {}) }}>Entrar →</span>
                      <span style={ui.metaHint}>{a.path}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {/*<div style={ui.footerNote}>
            <div style={ui.footerTitle}>Nota</div>
            <div style={ui.footerText}>
              Si no ves un módulo, revisá tus permisos en tu perfil.
            </div>
          </div>*/}
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

  main: {
    overflow: "auto",
    padding: 16,
    display: "grid",
    placeItems: "start center",
  },
  container: {
    width: "min(1100px, 100%)",
    display: "grid",
    gap: 14,
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
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

  card: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
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
    height: 120,
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

  cardBody: { padding: 16 },

  cardTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A", marginBottom: 6 },
  cardDesc: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.35, minHeight: 38 },

  cardFooter: { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
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
  footerText: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.4 },
};