import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import { auth } from "../firebase";
import { ArrowRight, LayoutDashboard, Loader2, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import logoAppolo from "../assets/AppOLO_logo.png";
import { AreasSidebar } from "../components/ui";
import { ACCENT, ACCENT_SOFT, BG, BORDER, MUTED, SLATE_DEEP, TEXT } from "../styles/theme";
import { useTheme } from "../theme/themeCore";

/* ─── Design tokens (aligned with the app theme accent #089F8A) ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: ACCENT_SOFT,
  accentGlow: "rgba(8,159,138,0.28)",
  bg: BG,
  surface: "var(--c-surface, #FFFFFF)",
  surfaceAlt: "var(--c-surface-alt, #F1F5F9)",
  border: BORDER,
  borderSoft: "var(--c-border-soft, rgba(231,233,242,0.7))",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export default function HomeHub() {
  const nav = useNavigate();
  const { user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const { isDark, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = "hidden";
    document.body.style.background = T.bg;
    document.body.style.margin = "0";
    requestAnimationFrame(() => setMounted(true));
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Bienvenido";
  const email = user?.email || "";

  return (
    <div style={s.shell}>
      <style>{`
        @keyframes homeSpin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        @media (max-width: 560px) {
          .hh-brand-label { display: none !important; }
          .hh-userpill-name { display: none !important; }
        }
      `}</style>

      <AreasSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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

          {/* visually centered brand */}
          <div
            style={s.brand}
            role="button"
            tabIndex={0}
            onClick={() => nav("/welcome")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/welcome")}
          >
            <div style={s.brandIcon}>
              <LayoutDashboard size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div>
              <div style={s.brandName}>AppoloDesk</div>
              <div className="hh-brand-label" style={s.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={s.headerActions}>
            <button
              type="button"
              onClick={toggleTheme}
              style={s.themeBtn}
              title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-pressed={isDark}
            >
              {isDark ? (
                <Sun size={17} strokeWidth={2.2} />
              ) : (
                <Moon size={17} strokeWidth={2.2} />
              )}
            </button>
            <div style={s.userPill}>
              <div style={s.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span className="hh-userpill-name" style={s.userPillName}>{displayName}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{ ...s.logoutBtn, ...(busyLogout ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              title="Cerrar sesión"
            >
              {busyLogout ? (
                <Loader2 size={16} strokeWidth={2.2} style={{ animation: "homeSpin 0.7s linear infinite" }} />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Welcome ─── */}
      <main style={s.main}>
        <div
          style={{
            ...s.welcome,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(14px)",
          }}
        >
          <div style={s.logoWrap}>
            <img src={logoAppolo} alt="AppOLO" style={s.logo} draggable={false} />
          </div>

          <div style={s.greetingChip}>
            <span style={s.greetingDot} />
            <span>{greeting}</span>
          </div>

          <h1 style={s.name}>{displayName}</h1>

          <p style={s.subtitle}>
            Tu plataforma operativa está lista. Accedé a tus áreas de trabajo para comenzar.
          </p>

          <button type="button" onClick={() => nav("/areas")} style={s.cta} aria-label="Iniciar">
            <span>Iniciar</span>
            <ArrowRight size={18} strokeWidth={2.4} />
          </button>

          {email && <div style={s.email}>{email}</div>}
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
    background: `radial-gradient(ellipse at 50% 0%, ${T.accentSoft} 0%, ${T.bg} 60%)`,
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
    background: "var(--c-surface-translucent, rgba(255,255,255,0.85))",
    backdropFilter: "blur(12px) saturate(1.4)",
    WebkitBackdropFilter: "blur(12px) saturate(1.4)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    position: "relative",
    width: "100%",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    boxSizing: "border-box",
  },
  brand: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
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
  brandName: { fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  brandLabel: { fontWeight: 600, fontSize: 11, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  headerActions: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
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
    maxWidth: 140,
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
  themeBtn: {
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
    flexShrink: 0,
  },
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

  /* Welcome body */
  main: {
    width: "100%",
    minHeight: 0,
    overflow: "auto",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    WebkitOverflowScrolling: "touch",
  },
  welcome: {
    width: "min(560px, 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 16,
    transition: "opacity 500ms ease, transform 500ms cubic-bezier(0.22,1,0.36,1)",
  },
  logoWrap: { display: "grid", placeItems: "center", marginBottom: 4 },
  logo: { width: "clamp(120px, 22vw, 180px)", height: "auto", objectFit: "contain" },
  greetingChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: T.accent,
    background: T.accentSoft,
    padding: "6px 14px",
    borderRadius: 999,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  greetingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: T.accent,
    boxShadow: `0 0 0 3px ${T.accentSoft}`,
  },
  name: {
    margin: 0,
    fontSize: "clamp(30px, 6vw, 46px)",
    fontWeight: 850,
    color: T.text,
    letterSpacing: -0.8,
    lineHeight: 1.08,
  },
  subtitle: {
    margin: 0,
    fontSize: "clamp(14.5px, 2.4vw, 16.5px)",
    fontWeight: 500,
    color: T.textSecondary,
    lineHeight: 1.55,
    maxWidth: 440,
  },
  cta: {
    marginTop: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 30px",
    fontSize: 15.5,
    fontWeight: 800,
    color: "#fff",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 10px 26px ${T.accentGlow}`,
    transition: "transform 180ms ease, box-shadow 180ms ease",
  },
  email: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 500,
    color: T.textMuted,
    wordBreak: "break-all",
  },
};
