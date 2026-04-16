import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  LogOut,
  Scale,
  Search,
  User,
} from "lucide-react";
import { auth } from "../../firebase";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function PesajeTarimas() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [busyLogout, setBusyLogout] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);

  const modules = useMemo(
    () => [
      {
        key: "registrar-tarimas",
        title: "Registrar tarimas",
        desc: "Ingresá la información del pesaje de tarimas y guardá nuevos registros.",
        path: "/servicios-generales/pesaje-tarimas/registrar",
        tag: "Registro",
        icon: <Scale size={28} strokeWidth={2} color={ACCENT} />,
      },
      {
        key: "consultar-tarimas",
        title: "Consultar tarimas",
        desc: "Buscá y revisá registros de pesaje de tarimas ya almacenados.",
        path: "/servicios-generales/pesaje-tarimas/consultar",
        tag: "Consulta",
        icon: <Search size={28} strokeWidth={2} color={ACCENT} />,
      },
    ],
    []
  );

  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
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

  return (
    <div style={ui.scrollViewport}>
      <div style={ui.shell}>
        <header style={ui.topbar}>
          <div style={ui.topbarInner}>
            <div style={ui.topbarLeft}>
              <button
                type="button"
                onClick={() => nav("/servicios-generales")}
                style={ui.backBtn}
              >
                <ArrowLeft size={18} strokeWidth={2.2} />
                Servicios generales
              </button>
            </div>

            <div style={ui.brand}>
              <div style={ui.brandMark}>
                <Scale size={20} strokeWidth={2.25} color="#fff" />
              </div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ui.brandTitle}>Pesaje tarimas</div>
                <div style={ui.brandSub}>Zona Franca</div>
              </div>
            </div>

            <div style={ui.topbarRight}>
              <div style={ui.userBox}>
                <div style={ui.userAvatar}>
                  <User size={16} strokeWidth={2.2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={ui.userEmail}>{user?.email || "Sesión"}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                disabled={busyLogout}
                style={ui.logoutBtn}
                title="Cerrar sesión"
              >
                {busyLogout ? (
                  <Loader2
                    size={18}
                    style={{ animation: "spin 0.9s linear infinite" }}
                  />
                ) : (
                  <LogOut size={18} strokeWidth={2.2} />
                )}
              </button>
            </div>
          </div>
        </header>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        <main style={ui.main}>
          <div style={ui.pageHead}>
            <h1 style={ui.pageTitle}>Pesaje de tarimas</h1>
            <p style={ui.pageLead}>
              Seleccioná una opción para registrar nuevos pesajes o consultar
              registros existentes.
            </p>
          </div>

          <section style={ui.modulesSection}>
            <div style={ui.modulesGrid}>
              {modules.map((m) => {
                const hovered = hoveredCard === m.key;

                return (
                  <div
                    key={m.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => nav(m.path)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && nav(m.path)
                    }
                    onMouseEnter={() => setHoveredCard(m.key)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      ...ui.moduleCard,
                      ...(hovered ? ui.moduleCardHover : {}),
                    }}
                  >
                    <div style={ui.moduleCardTop}>
                      <span style={ui.moduleTag}>{m.tag}</span>
                      <div style={ui.moduleIconWrap}>{m.icon}</div>
                    </div>

                    <div style={ui.moduleBody}>
                      <h2 style={ui.moduleTitle}>{m.title}</h2>
                      <p style={ui.moduleDesc}>{m.desc}</p>

                      <div style={ui.moduleFooter}>
                        <span style={ui.moduleEnter}>
                          Entrar
                          <ArrowRight size={16} strokeWidth={2.5} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const ui = {
  scrollViewport: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    padding: "0 0 28px",
  },

  shell: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 16px",
    boxSizing: "border-box",
  },

  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    paddingTop: 14,
    paddingBottom: 12,
    background: "linear-gradient(180deg, #F6F7FB 85%, rgba(246,247,251,0))",
  },

  topbarInner: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
  },

  topbarLeft: { justifySelf: "start" },

  topbarRight: {
    justifySelf: "end",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #E2E8F0",
    background: "#fff",
    color: SLATE,
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },

  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: `linear-gradient(135deg, ${ACCENT}, #047857)`,
    display: "grid",
    placeItems: "center",
    boxShadow: `0 10px 22px ${ACCENT_SOFT}`,
  },

  brandTitle: {
    fontWeight: 950,
    fontSize: 16,
    color: "#0F172A",
    letterSpacing: -0.2,
    lineHeight: 1.15,
  },

  brandSub: {
    fontWeight: 800,
    fontSize: 12,
    color: SLATE,
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#fff",
    maxWidth: 260,
  },

  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
  },

  userEmail: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0F172A",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#fff",
    color: SLATE,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  },

  main: {
    paddingTop: 8,
    display: "grid",
    gap: 18,
  },

  pageHead: {
    display: "grid",
    gap: 8,
  },

  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },

  pageLead: {
    margin: 0,
    maxWidth: 680,
    fontSize: 14,
    lineHeight: 1.55,
    color: SLATE,
    fontWeight: 700,
  },

  modulesSection: {
    display: "grid",
    gap: 14,
  },

  modulesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
    gap: 16,
  },

  moduleCard: {
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
    overflow: "hidden",
    cursor: "pointer",
    textAlign: "left",
    transition:
      "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
  },

  moduleCardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 16px 36px rgba(15,23,42,0.09)",
    borderColor: "rgba(8,159,138,0.28)",
  },

  moduleCardTop: {
    padding: "16px 18px 12px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    background:
      "linear-gradient(180deg, rgba(8,159,138,0.06) 0%, transparent 100%)",
  },

  moduleTag: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: ACCENT,
    background: ACCENT_SOFT,
    border: "1px solid rgba(8,159,138,0.22)",
    padding: "4px 10px",
    borderRadius: 999,
  },

  moduleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: "#fff",
    border: "1px solid rgba(8,159,138,0.18)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  moduleBody: {
    padding: "4px 18px 18px",
    display: "grid",
    gap: 8,
  },

  moduleTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.2,
  },

  moduleDesc: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
  },

  moduleFooter: {
    marginTop: 4,
    paddingTop: 12,
    borderTop: "1px solid #EEF1F7",
  },

  moduleEnter: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 900,
    color: ACCENT,
  },
};