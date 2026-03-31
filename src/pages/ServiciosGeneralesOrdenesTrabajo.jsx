import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  LayoutGrid,
  Loader2,
  LogOut,
  Plus,
  User,
} from "lucide-react";
import { auth } from "../firebase";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function ServiciosGeneralesOrdenesTrabajo() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [busyLogout, setBusyLogout] = useState(false);
  const [hoveredModule, setHoveredModule] = useState(null);

  const modules = useMemo(
    () => [
      {
        key: "crear-ot",
        title: "Crear OT",
        desc: "Alta de nuevas órdenes de trabajo: datos del requerimiento, área y envío.",
        path: "/servicios-generales/ordenes-trabajo/crear",
        tag: "Alta",
        Icon: Plus,
      },
      {
        key: "gestion-ots",
        title: "Gestión de OTs",
        desc: "Seguimiento, listados, cambios de estado y cierre de órdenes abiertas.",
        path: "/servicios-generales/ordenes-trabajo/gestion",
        tag: "Operación",
        Icon: LayoutGrid,
      },
    ],
    []
  );

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

  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div style={ui.topbarLeft}>
            <button
              type="button"
              onClick={() => nav("/servicios-generales")}
              style={ui.backBtn}
              title="Volver a Servicios generales"
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
              Servicios generales
            </button>
          </div>

          <div style={ui.brand}>
            <div style={ui.brandMark}>
              <ClipboardList size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Órdenes de trabajo</div>
              <div style={ui.brandSub}>Servicios generales</div>
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
              onClick={() => void logout()}
              disabled={busyLogout}
              style={ui.btnGhost}
            >
              {busyLogout ? (
                <Loader2
                  size={16}
                  style={{ animation: "sgotSpin 0.7s linear infinite" }}
                />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
              Salir
            </button>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes sgotSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <main style={ui.main}>
        <div style={ui.container}>
          <div style={ui.pageHead}>
            <h1 style={ui.pageTitle}>Órdenes de trabajo</h1>
            <p style={ui.pageLead}>
              Elegí cómo querés trabajar: crear nuevas OT o administrar las que ya
              están en curso.
            </p>
          </div>

          <section style={ui.modulesSection} aria-label="Módulos de órdenes de trabajo">
            <div style={ui.modulesKicker}>Módulos</div>
            <div style={ui.modulesGrid}>
              {modules.map((m) => {
                const Icon = m.Icon;
                const hover = hoveredModule === m.key;
                return (
                  <div
                    key={m.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => nav(m.path)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && nav(m.path)
                    }
                    onMouseEnter={() => setHoveredModule(m.key)}
                    onMouseLeave={() => setHoveredModule(null)}
                    style={{
                      ...ui.moduleCard,
                      ...(hover ? ui.moduleCardHover : {}),
                    }}
                  >
                    <div style={ui.moduleCardTop}>
                      <span style={ui.moduleTag}>{m.tag}</span>
                      <div style={ui.moduleIconWrap}>
                        <Icon size={28} strokeWidth={2} color={ACCENT} />
                      </div>
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
        </div>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    zIndex: 10,
  },

  topbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
  },

  topbarLeft: {
    display: "flex",
    justifyContent: "flex-start",
  },

  topbarRight: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifySelf: "center",
    minWidth: 0,
  },

  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  brandTitle: {
    fontWeight: 950,
    fontSize: 15,
    color: "#0F172A",
    letterSpacing: -0.2,
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
    padding: "6px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    maxWidth: 260,
  },

  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
    color: ACCENT,
    flexShrink: 0,
  },

  userName: {
    fontWeight: 900,
    fontSize: 12,
    color: "#0F172A",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  userMail: {
    fontWeight: 700,
    fontSize: 11,
    color: SLATE,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "22px 16px 32px",
  },

  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 22,
  },

  pageHead: {
    display: "grid",
    gap: 8,
  },

  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },

  pageLead: {
    margin: 0,
    maxWidth: 720,
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
  },

  modulesSection: {
    display: "grid",
    gap: 14,
  },

  modulesKicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: ACCENT,
  },

  modulesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
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
    fontFamily: "inherit",
    transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
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
    background: "linear-gradient(180deg, rgba(8,159,138,0.06) 0%, transparent 100%)",
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
    fontSize: 19,
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
