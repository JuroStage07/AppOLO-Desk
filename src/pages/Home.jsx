import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import { auth } from "../firebase";
import {
  ArrowRight,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Shield,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";
import logoAppolo from "../assets/AppOLO_logo.png";
import { isEpaRestrictedUser } from "../config/epaOnlyUids";

const T = {
  accent: "#06B6A0",
  accentDark: "#059585",
  accentSoft: "rgba(6, 182, 160, 0.08)",
  accentGlow: "rgba(6, 182, 160, 0.3)",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E2E8F0",
  borderSoft: "rgba(226, 232, 240, 0.6)",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export default function Home() {
  const nav = useNavigate();
  const { profile, epaAdmin, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [mounted, setMounted] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.style.background = T.bg;
    document.body.style.margin = "0";
    requestAnimationFrame(() => setMounted(true));
    return () => {
      document.body.style.overflow = "";
      document.body.style.background = "";
      document.body.style.margin = "";
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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  const allAreas = useMemo(
    () => [
      { key: "despacho", title: "Despacho", path: "/despacho", tag: "Operación", icon: <Zap size={16} strokeWidth={2} /> },
      { key: "salud", title: "Salud Ocupacional", path: "/salud", tag: "Seguridad", icon: <Shield size={16} strokeWidth={2} /> },
      { key: "recepcion", title: "Recepción", path: "/recepcion", tag: "Inbound", icon: <ArrowRight size={16} strokeWidth={2} /> },
      { key: "mantenimiento", title: "Mantenimiento", path: "/mantenimiento", tag: "Mantenimiento", icon: <Clock size={16} strokeWidth={2} /> },
      { key: "servicios-generales", title: "Servicios Generales", path: "/servicios-generales", tag: "Servicios", icon: <Sparkles size={16} strokeWidth={2} /> },
      { key: "epa", title: "EPA", path: "/epa", tag: "EPA", icon: <LayoutDashboard size={16} strokeWidth={2} /> },
    ],
    []
  );

  const areas = useMemo(() => {
    if (isEpaRestrictedUser({ epaAdmin, profile, user })) {
      return allAreas.filter((a) => a.key === "epa");
    }
    return allAreas;
  }, [allAreas, epaAdmin, profile, user]);

  return (
    <div style={s.shell}>
      <style>{`
        @keyframes homeSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ─── Sidebar drawer ─── */}
      {sidebarOpen && (
        <div
          style={s.sidebarBackdrop}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        style={{
          ...s.sidebar,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}
        aria-hidden={!sidebarOpen}
      >
        <div style={s.sidebarHeader}>
          <span style={s.sidebarTitle}>Áreas de trabajo</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            style={s.sidebarClose}
            aria-label="Cerrar menú"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <nav style={s.sidebarNav}>
          {areas.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                setSidebarOpen(false);
                nav(a.path);
              }}
              style={s.sidebarItem}
            >
              <div style={s.sidebarItemIcon}>{a.icon}</div>
              <div style={s.sidebarItemText}>
                <span style={s.sidebarItemTitle}>{a.title}</span>
                <span style={s.sidebarItemTag}>{a.tag}</span>
              </div>
              <ChevronRight size={14} strokeWidth={2} color={T.textMuted} />
            </button>
          ))}
        </nav>
      </aside>

      {/* ─── Topbar ─── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={s.menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div
            style={s.brand}
            role="button"
            tabIndex={0}
            onClick={() => nav("/")}
            onKeyDown={(e) =>
              (e.key === "Enter" || e.key === " ") && nav("/")
            }
          >
            <div style={s.brandIcon}>
              <LayoutDashboard size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div>
              <div style={s.brandName}>AppoloDesk</div>
              <div style={s.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={s.headerActions}>
            <div style={s.userPill}>
              <div style={s.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span style={s.userPillName}>
                {user?.displayName || user?.email?.split("@")[0] || "Usuario"}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{
                ...s.logoutBtn,
                ...(busyLogout ? { opacity: 0.5, cursor: "not-allowed" } : {}),
              }}
              title="Cerrar sesión"
            >
              {busyLogout ? (
                <Loader2
                  size={16}
                  strokeWidth={2.2}
                  style={{ animation: "homeSpin 0.7s linear infinite" }}
                />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main style={s.main}>
        <div
          style={{
            ...s.content,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(24px)",
          }}
        >
          <img src={logoAppolo} alt="AppOLO Logo" style={s.logo} />

          <div style={s.textBlock}>
            <p style={s.greeting}>{greeting}</p>
            <h1 style={s.title}>{user?.displayName || "Bienvenido"}</h1>
            <p style={s.subtitle}>
              Tu plataforma operativa está lista. Accedé a tus áreas de trabajo
              para comenzar.
            </p>
          </div>

          <button
            type="button"
            onClick={() => nav("/")}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              ...s.btn,
              ...(btnHover ? s.btnHover : {}),
            }}
          >
            <span>Iniciar</span>
            <ArrowRight
              size={18}
              strokeWidth={2.2}
              style={{
                transition: "transform 200ms ease",
                transform: btnHover ? "translateX(4px)" : "translateX(0)",
              }}
            />
          </button>

          <p style={s.footer}>{user?.email || ""}</p>
        </div>
      </main>
    </div>
  );
}

const s = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    background: `radial-gradient(ellipse at 50% 0%, rgba(6,182,160,0.04) 0%, ${T.bg} 70%)`,
    fontFamily: T.font,
    color: T.text,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  /* Header */
  header: {
    width: "100%",
    borderBottom: `1px solid ${T.border}`,
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px) saturate(1.4)",
    WebkitBackdropFilter: "blur(12px) saturate(1.4)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "14px 24px",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 16,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    textDecoration: "none",
    justifySelf: "center",
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: `0 4px 16px ${T.accentGlow}`,
  },
  brandName: {
    fontWeight: 800,
    fontSize: 15,
    color: T.text,
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  brandLabel: {
    fontWeight: 600,
    fontSize: 11,
    color: T.textMuted,
    lineHeight: 1.2,
    marginTop: 1,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifySelf: "end",
  },
  userPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px 6px 6px",
    borderRadius: 999,
    background: T.surfaceAlt,
    border: `1px solid ${T.borderSoft}`,
  },
  userPillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userPillName: {
    fontWeight: 600,
    fontSize: 13,
    color: T.text,
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },

  /* Menu button */
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.text,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
    flexShrink: 0,
  },

  /* Sidebar */
  sidebarBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    zIndex: 999,
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 300,
    maxWidth: "85vw",
    background: T.surface,
    borderRight: `1px solid ${T.border}`,
    boxShadow: T.shadowLg,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: `1px solid ${T.border}`,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: 750,
    color: T.text,
    letterSpacing: -0.2,
  },
  sidebarClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: T.surfaceAlt,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    fontFamily: "inherit",
    padding: 0,
  },
  sidebarNav: {
    flex: 1,
    overflow: "auto",
    padding: "12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  sidebarItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    width: "100%",
    transition: "background 150ms ease",
  },
  sidebarItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: T.surfaceAlt,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  sidebarItemText: {
    flex: 1,
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  sidebarItemTitle: {
    fontSize: 13,
    fontWeight: 650,
    color: T.text,
    lineHeight: 1.2,
  },
  sidebarItemTag: {
    fontSize: 11,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.2,
  },

  /* Main */
  main: {
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 24,
    overflow: "hidden",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 28,
    textAlign: "center",
    maxWidth: 420,
    transition: "opacity 600ms ease, transform 600ms ease",
  },
  logo: {
    width: 140,
    height: "auto",
    objectFit: "contain",
    marginBottom: 8,
  },
  textBlock: {
    display: "grid",
    gap: 8,
  },
  greeting: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: T.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(26px, 5vw, 36px)",
    fontWeight: 800,
    color: T.text,
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    color: T.textSecondary,
    lineHeight: 1.5,
    maxWidth: 360,
    marginLeft: "auto",
    marginRight: "auto",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 32px",
    fontSize: 15,
    fontWeight: 700,
    color: "#fff",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 4px 20px ${T.accentGlow}`,
    transition: "all 200ms ease",
    marginTop: 4,
  },
  btnHover: {
    transform: "translateY(-2px)",
    boxShadow: `0 8px 32px ${T.accentGlow}, 0 0 0 4px rgba(6,182,160,0.1)`,
  },
  footer: {
    margin: 0,
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    marginTop: 8,
  },
};
