import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import { auth } from "../firebase";
import {
  ArrowRight,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Pin,
  User,
} from "lucide-react";
import logoAppolo from "../assets/AppOLO_logo.png";
import { isEpaRestrictedUser } from "../config/epaOnlyUids";
import { AREA_THEMES, getVisibleAreas } from "../config/workAreas";
import { useAllPinnedModules } from "../hooks/usePinnedModules";
import { AreasSidebar } from "../components/ui";
import { ACCENT, ACCENT_SOFT, BG, BORDER, MUTED, SLATE_DEEP, TEXT } from "../styles/theme";

/* ─── Design tokens (aligned with the app theme accent #089F8A) ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: ACCENT_SOFT,
  accentGlow: "rgba(8,159,138,0.28)",
  bg: BG,
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: BORDER,
  borderSoft: "rgba(231,233,242,0.7)",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/* ─── Area card (mirrors the hub look, per-area accent) ─── */
function AreaCard({ area, idx, mounted, hovered, onHover, onLeave, onNavigate }) {
  const theme = area.theme || AREA_THEMES[area.key] || { accent: T.accent, soft: T.accentSoft };
  const isHover = hovered === area.key;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(area.path)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate(area.path)}
      onMouseEnter={() => onHover(area.key)}
      onMouseLeave={onLeave}
      style={{
        ...s.card,
        ...(isHover ? { borderColor: theme.accent, boxShadow: T.shadowMd } : {}),
        transitionDelay: `${idx * 45}ms`,
        opacity: mounted ? 1 : 0,
        transform: mounted ? (isHover ? "translateY(-4px)" : "translateY(0)") : "translateY(18px)",
      }}
    >
      <div style={s.cardIconStage}>
        {area.img ? (
          <img src={area.img} alt="" style={s.cardIconImg} draggable={false} />
        ) : (
          <div style={{ ...s.cardIconFallback, background: theme.soft, color: theme.accent }}>
            {React.isValidElement(area.icon)
              ? React.cloneElement(area.icon, { size: 30, strokeWidth: 1.9 })
              : area.icon}
          </div>
        )}
      </div>

      <span style={{ ...s.cardBadge, background: theme.soft, color: theme.accent }}>{area.tag}</span>
      <h3 style={s.cardTitle}>{area.title}</h3>
      <p style={s.cardDesc}>{area.desc}</p>

      <div style={s.cardAction}>
        <span style={{ ...s.cardActionLink, color: isHover ? theme.accent : T.textSecondary }}>
          <span>Abrir módulo</span>
          <ArrowRight
            size={15}
            strokeWidth={2.5}
            style={{ transition: "transform 200ms ease", transform: isHover ? "translateX(4px)" : "translateX(0)" }}
          />
        </span>
      </div>
    </div>
  );
}

export default function HomeHub() {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [mounted, setMounted] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const { pins } = useAllPinnedModules();

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

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
  const areas = useMemo(() => getVisibleAreas({ epaOnly, role }), [epaOnly, role]);

  const quickPins = useMemo(
    () => (epaOnly ? pins.filter((p) => p.moduleKey === "epa") : pins),
    [pins, epaOnly]
  );

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Bienvenido";

  return (
    <div style={s.shell}>
      <style>{`
        @keyframes homeSpin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
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
              <div style={s.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={s.headerActions}>
            <div style={s.userPill}>
              <div style={s.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span style={s.userPillName}>{displayName}</span>
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

      {/* ─── Main ─── */}
      <main style={s.main}>
        <div style={s.container}>
          {/* Welcome banner */}
          <section
            style={{
              ...s.hero,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div style={s.heroText}>
              <div style={s.greetingChip}>
                <span style={s.greetingDot} />
                <span>{greeting}</span>
              </div>
              <h1 style={s.heroTitle}>{displayName}</h1>
              <p style={s.heroSubtitle}>
                Tu plataforma operativa está lista. Elegí un área para comenzar o abrí el panel completo.
              </p>
              <button type="button" onClick={() => nav("/")} style={s.heroCta}>
                <span>Ir al panel</span>
                <ArrowRight size={17} strokeWidth={2.3} />
              </button>
            </div>
            <div style={s.heroLogoWrap} aria-hidden="true">
              <img src={logoAppolo} alt="" style={s.heroLogo} />
            </div>
          </section>

          {/* Quick access (pinned) */}
          {quickPins.length > 0 && (
            <section
              style={{
                ...s.section,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(14px)",
                transitionDelay: "80ms",
              }}
            >
              <div style={s.sectionHead}>
                <h2 style={s.sectionTitle}>
                  <Pin size={15} strokeWidth={2.4} style={{ transform: "rotate(-45deg)", color: T.accent }} />
                  Acceso rápido
                </h2>
                <span style={s.sectionBadge}>{quickPins.length}</span>
              </div>
              <div style={s.pinGrid}>
                {quickPins.map((p) => (
                  <button
                    key={`${p.moduleKey}:${p.path}`}
                    type="button"
                    onClick={() => nav(p.path)}
                    style={s.pinCard}
                    onMouseEnter={() => setHovered(`pin:${p.path}`)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span style={s.pinIcon}>
                      <LayoutDashboard size={16} strokeWidth={2.1} />
                    </span>
                    <span style={s.pinLabel}>{p.label}</span>
                    <ArrowRight
                      size={14}
                      strokeWidth={2.2}
                      color={hovered === `pin:${p.path}` ? T.accent : T.textMuted}
                      style={{ transition: "color 150ms ease", flexShrink: 0 }}
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Areas grid */}
          <section
            style={{
              ...s.section,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(16px)",
              transitionDelay: "120ms",
            }}
          >
            <div style={s.sectionHead}>
              <h2 style={s.sectionTitle}>
                <Lock size={14} strokeWidth={2.4} style={{ color: T.accent }} />
                Tus áreas de trabajo
              </h2>
              <span style={s.sectionBadge}>{areas.length}</span>
            </div>
            <div style={s.grid}>
              {areas.map((a, idx) => (
                <AreaCard
                  key={a.key}
                  area={a}
                  idx={idx}
                  mounted={mounted}
                  hovered={hovered}
                  onHover={setHovered}
                  onLeave={() => setHovered(null)}
                  onNavigate={(path) => nav(path)}
                />
              ))}
            </div>
          </section>
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
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    marginLeft: 4,
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

  /* Main */
  main: {
    width: "100%",
    minHeight: 0,
    overflow: "auto",
    padding: "28px 24px 56px",
    WebkitOverflowScrolling: "touch",
  },
  container: { maxWidth: 1200, margin: "0 auto", display: "grid", gap: 28 },

  /* Hero banner */
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    padding: "26px 28px",
    borderRadius: 22,
    background: `linear-gradient(135deg, #fff 0%, ${T.accentSoft} 140%)`,
    border: `1px solid ${T.border}`,
    boxShadow: T.shadow,
    transition: "opacity 450ms ease, transform 450ms ease",
  },
  heroText: { display: "grid", gap: 10, minWidth: 0, flex: "1 1 320px" },
  greetingChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: T.accent,
    background: T.accentSoft,
    padding: "5px 12px",
    borderRadius: 999,
    width: "fit-content",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  greetingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: T.accent,
    boxShadow: `0 0 0 3px ${T.accentSoft}`,
  },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(26px, 4vw, 38px)",
    fontWeight: 850,
    color: T.text,
    letterSpacing: -0.6,
    lineHeight: 1.08,
  },
  heroSubtitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    color: T.textSecondary,
    lineHeight: 1.5,
    maxWidth: 460,
  },
  heroCta: {
    marginTop: 6,
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    width: "fit-content",
    padding: "12px 22px",
    fontSize: 14.5,
    fontWeight: 800,
    color: "#fff",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    border: "none",
    borderRadius: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 8px 22px ${T.accentGlow}`,
  },
  heroLogoWrap: { display: "grid", placeItems: "center", flexShrink: 0 },
  heroLogo: { width: "clamp(96px, 16vw, 150px)", height: "auto", objectFit: "contain", opacity: 0.96 },

  /* Sections */
  section: { display: "grid", gap: 14, transition: "opacity 450ms ease, transform 450ms ease" },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: {
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 16,
    fontWeight: 800,
    color: T.text,
    letterSpacing: -0.2,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: T.textSecondary,
    minWidth: 24,
    textAlign: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: T.surface,
    border: `1px solid ${T.border}`,
  },

  /* Pinned quick access */
  pinGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
    gap: 12,
  },
  pinCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    boxShadow: T.shadow,
    transition: "border-color 150ms ease, transform 150ms ease",
  },
  pinIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  pinLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    color: T.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },

  /* Areas grid */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
    gap: 16,
  },
  card: {
    position: "relative",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    padding: "20px 18px 18px",
    cursor: "pointer",
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 10,
    boxShadow: T.shadow,
    outline: "none",
    transition:
      "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 260ms ease, border-color 200ms ease, opacity 400ms ease",
  },
  cardIconStage: { width: 76, height: 76, display: "grid", placeItems: "center", marginBottom: 2 },
  cardIconImg: {
    width: 68,
    height: 68,
    objectFit: "contain",
    borderRadius: 16,
    boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
  },
  cardIconFallback: {
    width: 68,
    height: 68,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
  },
  cardBadge: { padding: "5px 12px", borderRadius: 999, fontWeight: 800, fontSize: 11, letterSpacing: 0.15, lineHeight: 1.2 },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: -0.25, lineHeight: 1.2 },
  cardDesc: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    width: "100%",
  },
  cardAction: { marginTop: "auto", paddingTop: 12, width: "100%", borderTop: `1px solid ${T.borderSoft}` },
  cardActionLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    fontSize: 12.5,
    fontWeight: 700,
    transition: "color 200ms ease",
  },
};
