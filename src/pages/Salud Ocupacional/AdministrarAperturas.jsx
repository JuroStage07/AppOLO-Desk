// screens/aperturas/AdministrarAperturas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";

// Si querés imágenes reales como en SaludOcupacional,
// importalas acá y reemplazá los placeholders.
import imgProceso from "../../assets/aperturas.png";
import imgFinalizadas from "../../assets/revisionEquipos.png";
import imgRechazadas from "../../assets/ingresoTerceros.png";

const ACCENT = "#089F8A";

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

  // Opcional: si luego conectás listeners, reemplazás estos states
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
      {/* Topbar */}
      <div style={ui.topbar}>
        <div style={ui.brand} role="button" tabIndex={0} onClick={() => go("/salud/aperturas")}>
          <div style={ui.brandMark}>AP</div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>Aperturas</div>
            <div style={ui.brandSub}>Administrar</div>
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

          <button type="button" onClick={() => go("/salud/")} style={ui.btnGhost} disabled={busyLogout}>
            ← Menú
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
                <div style={ui.kicker}>Gestión</div>
                <span style={ui.badge}>{fechaHoy}</span>
              </div>

              <h1 style={ui.title}>Administrar Aperturas</h1>
              <p style={ui.subtitle}>
                Elegí una categoría para ver su lista y gestionar rápidamente.
              </p>

              <div style={ui.chipsRow}>
                <span style={ui.chipSoft}>
                  En proceso: <b>{countProceso}</b>
                </span>
                <span style={ui.chipSoft}>
                  Rechazadas: <b>{countRechazadas}</b>
                </span>
              </div>
            </div>

            <div style={ui.heroSide}>
              <div style={ui.quickCard}>
                <div style={ui.quickLabel}>Acceso rápido</div>
                <div style={ui.quickBtns}>
                  <button
                    type="button"
                    onClick={() => go("/salud/aperturas/proceso")}
                    style={{ ...ui.quickBtn, ...ui.quickBtnAccent }}
                    disabled={busyLogout}
                  >
                    Ir a En proceso →
                  </button>

                  <button
                    type="button"
                    onClick={() => go("/salud/aperturas/rechazadas")}
                    style={ui.quickBtn}
                    disabled={busyLogout}
                  >
                    Ver Rechazadas →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grid */}
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
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(m.path)}
                  onMouseEnter={() => setHovered(m.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...ui.moduleCard,
                    ...(isHover ? ui.moduleCardHover : {}),
                    ...(accent ? ui.moduleCardAccent : {}),
                  }}
                >
                  {/* Imagen */}
                  <div style={{ ...ui.media, backgroundImage: `url(${m.img})` }}>
                    <div style={ui.mediaOverlay} />

                    <div style={ui.mediaTop}>
                      <span style={{ ...ui.pill, ...(accent ? ui.pillAccent : {}) }}>
                        {m.tag}
                      </span>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {typeof m.badge === "number" && (
                          <span style={ui.countPill}>{m.badge}</span>
                        )}

                        <span
                          style={{
                            ...ui.statusPill,
                            ...(moduleMeta[m.key]?.status === "LISTO" ? ui.statusOk : ui.statusProx),
                          }}
                        >
                          {statusLabel(moduleMeta[m.key]?.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contenido */}
                  <div style={ui.cardBody}>
                    <div style={ui.cardTitle}>{m.title}</div>
                    <div style={ui.cardDesc}>{m.desc}</div>

                    <div style={ui.cardFooter}>
                      <span style={{ ...ui.link, ...(accent ? ui.linkAccent : {}) }}>Entrar →</span>
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
              Tocá una categoría para filtrar y gestionar rápidamente. Si algo no abre,
              verificá rutas y permisos (ej: <b>permisos.saludOcupacional</b>).
            </div>
          </div>
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

  chipsRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 },
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
  quickBtnAccent: { borderColor: "rgba(8,159,138,0.35)", background: "#F3FBF9" },

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
  moduleCardHover: { transform: "translateY(-2px)", boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)" },

  media: {
    height: 120,
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

  cardBody: { padding: 16 },
  cardTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A", marginBottom: 6 },
  cardDesc: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.35, minHeight: 36 },

  cardFooter: { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  link: { color: "#0F172A", fontWeight: 980, fontSize: 12 },
  linkAccent: { color: ACCENT },
  metaHint: { color: "#94A3B8", fontWeight: 800, fontSize: 12 },

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
  statusProx: { background: "rgba(148,163,184,0.26)" },

  countPill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.16)",
    color: "#fff",
    fontWeight: 980,
    fontSize: 11,
    backdropFilter: "blur(6px)",
  },

  footerNote: {
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: 14,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  footerTitle: { fontWeight: 980, color: "#0F172A", marginBottom: 6 },
  footerText: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.4 },

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