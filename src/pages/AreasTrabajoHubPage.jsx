import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Cog,
  Inbox,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  LogOut,
  Lock,
  Menu,
  Search,
  User,
  X,
} from "lucide-react";
import { auth } from "../firebase";

import { isEpaRestrictedUser } from "../config/epaOnlyUids";
import { getVisibleAreas } from "../config/workAreas";
import { AreasSidebar, SidebarAreaIcon } from "../components/ui";
import logoAppolo from "../assets/AppOLO_logo.png";
import imgApolo from "../assets/Apolo.png";

/* ─── Design tokens (unified with app theme accent #089F8A) ─── */
const T = {
  accent: "#089F8A",
  accentDark: "#06776A",
  accentSoft: "rgba(8, 159, 138, 0.10)",
  accentGlow: "rgba(8, 159, 138, 0.28)",
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E5E9F0",
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/* Radial geometry (percentages relative to the wheel container / viewBox).
   Icons are centred in the band between the core and the outer rim. */
const RING_RADIUS = 33;
const WEDGE_RADIUS = 48; // normal wheel radius (base sectors / rim)
const ACTIVE_WEDGE_RADIUS = 58; // active sector grows beyond the base circle
const INNER_ACTIVE_RADIUS = 22; // inner edge of the active slice (aligns with the ring around the core)
const GRAY_ARC_RADIUS = 54; // grey arc inside the expanded sector, closer to the outer edge
const DASHED_ARC_RADIUS = 51; // dashed arc just before (inward of) the grey arc

/**
 * Fixed main menu of the wheel — 4 large actions, one per quadrant.
 * `angle` is in degrees on screen coords (0 = right, 90 = down). These are
 * intentionally NOT the work areas: the "Áreas" action opens a modal that lists
 * the work areas (Encarta-style lateral categories + dynamic central panel).
 */
const MENU_ACTIONS = [
  { key: "areas", title: "Áreas", icon: <LayoutGrid />, angle: 225, accent: "#2563EB", soft: "rgba(37,99,235,0.12)" },
  { key: "operacion", title: "Operación", icon: <Activity />, angle: 315, accent: "#089F8A", soft: "rgba(8,159,138,0.12)" },
  { key: "reportes", title: "Reportes", icon: <BarChart3 />, angle: 135, accent: "#7C3AED", soft: "rgba(124,58,237,0.12)" },
  { key: "configuracion", title: "Configuración", icon: <Cog />, angle: 45, accent: "#EA580C", soft: "rgba(234,88,12,0.12)" },
];

/* Turn an area accent (hex) into a soft rgba tint — used to derive module colors. */
function hexToRgba(hex, alpha) {
  if (typeof hex !== "string" || !hex.startsWith("#")) return `rgba(8,159,138,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Convert a polar angle into the SVG arc endpoints of a sector wedge. */
function sectorPath(centerAngle, span, radius = WEDGE_RADIUS) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const x1 = 50 + radius * Math.cos(a1);
  const y1 = 50 + radius * Math.sin(a1);
  const x2 = 50 + radius * Math.cos(a2);
  const y2 = 50 + radius * Math.sin(a2);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M 50 50 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/* A single arc (no radial edges) at a given radius — used to echo the wheel's
   normal rim curvature inside the expanded active sector. */
function arcPath(centerAngle, span, radius) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const x1 = 50 + radius * Math.cos(a1);
  const y1 = 50 + radius * Math.sin(a1);
  const x2 = 50 + radius * Math.cos(a2);
  const y2 = 50 + radius * Math.sin(a2);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}

/* Annular ("donut slice") sector between innerR and outerR — used for the
   active piece so it reads as a grown chunk of the wheel without covering the
   centre. The stroke of this single path yields the outer arc, the inner arc
   and both radial edges at once. */
function annularSectorPath(centerAngle, span, innerR, outerR) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const ox1 = 50 + outerR * Math.cos(a1);
  const oy1 = 50 + outerR * Math.sin(a1);
  const ox2 = 50 + outerR * Math.cos(a2);
  const oy2 = 50 + outerR * Math.sin(a2);
  const ix2 = 50 + innerR * Math.cos(a2);
  const iy2 = 50 + innerR * Math.sin(a2);
  const ix1 = 50 + innerR * Math.cos(a1);
  const iy1 = 50 + innerR * Math.sin(a1);
  const largeArc = span > Math.PI ? 1 : 0;
  return (
    `M ${ox1.toFixed(3)} ${oy1.toFixed(3)} ` +
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2.toFixed(3)} ${oy2.toFixed(3)} ` +
    `L ${ix2.toFixed(3)} ${iy2.toFixed(3)} ` +
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1.toFixed(3)} ${iy1.toFixed(3)} Z`
  );
}

/* ─── A single fixed action placed radially on the wheel ─── */
/* Presentational only (pointerEvents: none). The hover/focus/click is handled
   by a large invisible quadrant hit area (QuadrantHit) so the user never has to
   aim precisely at the icon. This node just reflects `hovered`. */
function ActionNode({ action, x, y, delay, mounted, hovered, badge }) {
  const isHover = hovered === action.key;
  // Top quadrants show the tooltip above (outward), bottom quadrants below.
  const placeTop = y < 0;
  return (
    <div
      aria-hidden="true"
      style={{
        ...styles.node,
        left: `calc(50% + ${x}%)`,
        top: `calc(50% + ${y}%)`,
        transitionDelay: `${delay}ms`,
        opacity: mounted ? 1 : 0,
        // The whole node scales up on hover/focus, keeping the centering
        // translate so its anchor point (the icon centre) never moves.
        transform: `translate(-50%, -50%) scale(${mounted ? (isHover ? 1.08 : 1) : 0.6})`,
        zIndex: isHover ? 9 : 6,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          ...styles.nodeBtn,
          borderColor: isHover ? action.accent : T.border,
          background: isHover ? action.soft : T.surface,
          boxShadow: isHover ? `${T.shadowMd}, 0 0 0 4px ${action.soft}` : T.shadow,
        }}
      >
        <span style={{ ...styles.nodeIcon, background: isHover ? "transparent" : action.soft, color: action.accent }}>
          {React.cloneElement(action.icon, { size: "56%", strokeWidth: 2 })}
        </span>
        {badge != null && <span style={{ ...styles.nodeBadge, background: action.accent }}>{badge}</span>}
      </span>

      {/* floating tooltip — only visible on hover/focus, never shifts layout */}
      <span
        role="tooltip"
        style={{
          ...styles.nodeTip,
          ...(placeTop ? styles.nodeTipTop : styles.nodeTipBottom),
          background: action.accent,
          opacity: isHover ? 1 : 0,
          transform: `translateX(-50%) translateY(${isHover ? "0" : placeTop ? "4px" : "-4px"})`,
        }}
      >
        {action.title}
      </span>
    </div>
  );
}

/* ─── Areas modal (lateral categories + dynamic central panel) ─── */
function AreasModal({ areas, onClose, onNavigate, onComingSoon }) {
  const [activeKey, setActiveKey] = useState(areas[0]?.key ?? null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = useMemo(
    () => areas.find((a) => a.key === activeKey) || areas[0] || null,
    [areas, activeKey]
  );
  const accent = active?.theme?.accent || T.accent;

  const half = Math.ceil(areas.length / 2);
  const leftAreas = areas.slice(0, half);
  const rightAreas = areas.slice(half);

  // Navigate (or open the coming-soon dialog) and close the modal.
  const openArea = (area) => {
    if (area.blocked) return;
    onClose();
    if (area.comingSoon) onComingSoon(area);
    else onNavigate(area.path);
  };
  const go = (path) => {
    onClose();
    onNavigate(path);
  };

  const renderCard = (area) => {
    const isActive = area.key === active?.key;
    const ac = area.theme?.accent || T.accent;
    const blocked = area.blocked === true;
    return (
      <button
        key={area.key}
        type="button"
        className="hh-area-card"
        onClick={() => openArea(area)}
        onMouseEnter={() => {
          if (area.key !== activeKey) setActiveKey(area.key);
        }}
        onFocus={() => {
          if (area.key !== activeKey) setActiveKey(area.key);
        }}
        aria-label={`Ver área ${area.title}`}
        style={{
          ...styles.areaCard,
          borderColor: isActive ? ac : T.border,
          background: isActive ? hexToRgba(ac, 0.08) : T.surface,
          boxShadow: isActive ? `0 6px 18px ${hexToRgba(ac, 0.18)}` : T.shadow,
          opacity: blocked ? 0.6 : 1,
        }}
      >
        <span style={{ ...styles.areaCardIcon, background: hexToRgba(ac, 0.12), color: ac }}>
          {area.img ? (
            <img src={area.img} alt="" style={styles.areaCardImg} draggable={false} />
          ) : React.isValidElement(area.icon) ? (
            React.cloneElement(area.icon, { size: 20, strokeWidth: 2 })
          ) : (
            area.icon
          )}
        </span>
        <span style={{ ...styles.areaCardTitle, color: isActive ? ac : T.text }}>{area.title}</span>
        {blocked ? (
          <Lock size={14} strokeWidth={2.2} style={{ marginLeft: "auto", color: T.textMuted, flexShrink: 0 }} />
        ) : (
          <ChevronRight
            size={16}
            strokeWidth={2.2}
            style={{ marginLeft: "auto", color: isActive ? ac : T.textMuted, flexShrink: 0 }}
          />
        )}
      </button>
    );
  };

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div
        className="hh-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Áreas de trabajo"
        onClick={(e) => e.stopPropagation()}
        style={{ ...styles.modal, borderTop: `4px solid ${accent}` }}
      >
        {/* Header */}
        <div style={styles.modalHead}>
          <div style={styles.modalHeadTitle}>
            <span style={{ ...styles.modalHeadIcon, background: hexToRgba(accent, 0.12), color: accent }}>
              <LayoutGrid size={18} strokeWidth={2.2} />
            </span>
            <div>
              <div style={styles.modalTitle}>Áreas de trabajo</div>
              <div style={styles.modalSubtitle}>Seleccioná un área para comenzar</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal" style={styles.modalClose}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {areas.length === 0 ? (
          <div style={styles.modalEmpty}>
            <span style={styles.modalEmptyIcon}>
              <Inbox size={28} strokeWidth={1.8} />
            </span>
            <div style={styles.modalEmptyTitle}>No hay áreas disponibles</div>
            <div style={styles.modalEmptyDesc}>Tu usuario no tiene áreas asignadas por el momento.</div>
          </div>
        ) : (
          <div className="hh-modal-body">
            {/* Left categories */}
            <div className="hh-modal-side">{leftAreas.map(renderCard)}</div>

            {/* Central panel */}
            <div
              className="hh-modal-center"
              style={{
                ...styles.center,
                background: `linear-gradient(160deg, ${hexToRgba(accent, 0.07)} 0%, #fff 55%)`,
                borderColor: hexToRgba(accent, 0.25),
              }}
            >
              {active && (
                <>
                  <div style={styles.centerHero}>
                    <span style={{ ...styles.centerIcon, background: hexToRgba(accent, 0.14), color: accent }}>
                      {active.img ? (
                        <img src={active.img} alt="" style={styles.centerImg} draggable={false} />
                      ) : React.isValidElement(active.icon) ? (
                        React.cloneElement(active.icon, { size: 30, strokeWidth: 1.9 })
                      ) : (
                        active.icon
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      {active.tag && (
                        <span style={{ ...styles.centerTag, background: hexToRgba(accent, 0.12), color: accent }}>
                          {active.tag}
                        </span>
                      )}
                      <h3 style={styles.centerTitle}>{active.title}</h3>
                    </div>
                  </div>

                  <p style={styles.centerDesc}>{active.desc}</p>

                  <button
                    type="button"
                    onClick={() => openArea(active)}
                    disabled={active.blocked}
                    aria-label={`Abrir área ${active.title}`}
                    style={{
                      ...styles.centerCta,
                      background: active.blocked ? T.textMuted : accent,
                      boxShadow: active.blocked ? "none" : `0 8px 20px ${hexToRgba(accent, 0.3)}`,
                      cursor: active.blocked ? "not-allowed" : "pointer",
                    }}
                  >
                    <span>
                      {active.blocked ? "No disponible" : active.comingSoon ? "Ver detalle" : `Abrir ${active.title}`}
                    </span>
                    {!active.blocked && <ArrowRight size={16} strokeWidth={2.4} />}
                  </button>

                  <div style={styles.modulesWrap}>
                    {active.modules && active.modules.length > 0 ? (
                      active.modules.map((m, i) => (
                        <div key={m.path || m.label} style={styles.modBlock}>
                          <button
                            type="button"
                            className="hh-mod-btn"
                            onClick={() => m.path && go(m.path)}
                            disabled={!m.path}
                            aria-label={`Abrir ${m.label}`}
                            style={{
                              ...styles.modBtn,
                              background: hexToRgba(accent, 0.09 + (i % 3) * 0.03),
                              borderColor: hexToRgba(accent, 0.22),
                              cursor: m.path ? "pointer" : "default",
                            }}
                          >
                            <span style={{ ...styles.modDot, background: accent }} />
                            <span style={styles.modLabel}>{m.label}</span>
                            {m.path && <ChevronRight size={15} strokeWidth={2.2} style={{ color: accent, flexShrink: 0 }} />}
                          </button>
                          {m.features && m.features.length > 0 && (
                            <div style={styles.featuresRow}>
                              {m.features.map((f) => (
                                <button
                                  key={f.path || f.label}
                                  type="button"
                                  onClick={() => f.path && go(f.path)}
                                  aria-label={`Abrir ${f.label}`}
                                  style={{ ...styles.featureChip, borderColor: hexToRgba(accent, 0.28), color: accent }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={styles.modEmpty}>
                        {active.comingSoon ? "Disponible próximamente." : "Sin módulos por ahora."}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Right categories */}
            <div className="hh-modal-side">{rightAreas.map(renderCard)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AreasTrabajoHubPage() {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [hovered, setHovered] = useState(null);
  const [busyLogout, setBusyLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [comingSoonArea, setComingSoonArea] = useState(null);
  const [areasModalOpen, setAreasModalOpen] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = T.bg;
    document.body.style.margin = "0";

    requestAnimationFrame(() => setMounted(true));

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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });

  const areas = useMemo(() => getVisibleAreas({ epaOnly, role }), [epaOnly, role]);

  const term = query.trim().toLowerCase();

  // Flat list of matching submodules when searching (secondary panel).
  const filteredSubModules = useMemo(() => {
    if (!term) return [];
    const results = [];
    areas.forEach((a) => {
      if (a.blocked) return;
      const titleMatch = a.title.toLowerCase().includes(term);
      (a.subModules || []).forEach((sub) => {
        if (titleMatch || sub.label.toLowerCase().includes(term)) {
          results.push({ ...sub, parentTitle: a.title, parentImg: a.img, parentIcon: a.icon, parentKey: a.key });
        }
      });
    });
    return results;
  }, [areas, term]);

  /* Central dispatcher for the fixed wheel actions. */
  const handleMenuAction = (key) => {
    switch (key) {
      case "areas":
        setAreasModalOpen(true);
        break;
      case "operacion":
        nav("/areas");
        break;
      case "configuracion":
        nav("/config-region");
        break;
      case "reportes":
        nav("/areas");
        break;
      default:
        break;
    }
  };

  /* Pre-compute radial coordinates + sector wedges for the 4 fixed actions. */
  const { nodes, wedges } = useMemo(() => {
    const span = (2 * Math.PI) / MENU_ACTIONS.length; // 90° quadrants
    const nodes = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return { action, x: RING_RADIUS * Math.cos(ang), y: RING_RADIUS * Math.sin(ang) };
    });
    const wedges = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return {
        key: action.key,
        accent: action.accent,
        soft: action.soft,
        d: sectorPath(ang, span),
        dActive: annularSectorPath(ang, span, INNER_ACTIVE_RADIUS, ACTIVE_WEDGE_RADIUS),
        dArc: arcPath(ang, span, GRAY_ARC_RADIUS),
        dDash: arcPath(ang, span, DASHED_ARC_RADIUS),
      };
    });
    return { nodes, wedges };
  }, []);

  return (
    <div style={styles.shell}>
      <style>{cssAnimations}</style>

      {/* ─── Shared global sidebar drawer ─── */}
      <AreasSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ─── Header ─── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={styles.menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div
            style={styles.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/areas")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/areas")}
          >
            <div style={styles.brandIcon}>
              <LayoutDashboard size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div className="hh-brand-text">
              <div style={styles.brandName}>AppoloDesk</div>
              <div style={styles.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={styles.headerActions}>
            <div style={styles.userPill}>
              <div style={styles.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span className="hh-userpill-name" style={styles.userPillName}>
                {user?.displayName || user?.email?.split("@")[0] || "Usuario"}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{ ...styles.logoutBtn, ...(busyLogout ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
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

      {/* ─── Main content ─── */}
      <main style={styles.main}>
        <div style={styles.container}>
          {/* Hero (above the wheel) */}
          <section
            style={{
              ...styles.hero,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div style={styles.heroText}>
              <div style={styles.greetingChip}>
                <span style={styles.greetingDot} />
                <span>{greeting}</span>
              </div>
              <h1 style={styles.heroTitle}>{user?.displayName || "Operador"}</h1>
              <p style={styles.heroSubtitle}>
                Tu plataforma operativa está lista. Elegí un área para comenzar.
              </p>
            </div>

            <div style={styles.heroLogoWrap} aria-hidden="true">
              <img src={logoAppolo} alt="" style={styles.heroLogo} draggable={false} />
            </div>
          </section>

          {/* Search row (compact, below the hero) */}
          <div
            style={{
              ...styles.searchRow,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(10px)",
              transitionDelay: "60ms",
            }}
          >
            <div style={{ ...styles.searchWrap, ...(searchFocus ? styles.searchWrapFocus : {}) }}>
              <Search size={17} strokeWidth={2.2} color={searchFocus ? T.accent : T.textMuted} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setSearchFocus(false)}
                placeholder="Buscar área o sección…"
                style={styles.searchInput}
                aria-label="Buscar área"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} style={styles.searchClear} aria-label="Limpiar búsqueda">
                  <X size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <span style={styles.heroBadge}>
              {term
                ? `${filteredSubModules.length} ${filteredSubModules.length === 1 ? "resultado" : "resultados"}`
                : `${areas.length} disponibles`}
            </span>
          </div>

          {/* Search results panel (secondary) OR the circular menu (default) */}
          {term ? (
            <section
              style={{
                ...styles.resultsSection,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Resultados de búsqueda</h2>
                <button type="button" onClick={() => setQuery("")} style={styles.linkBtn}>
                  Volver al menú
                </button>
              </div>

              {filteredSubModules.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>
                    <Search size={22} strokeWidth={2} color={T.textMuted} />
                  </div>
                  <div style={styles.emptyTitle}>Sin resultados</div>
                  <div style={styles.emptyText}>No encontramos áreas ni secciones para “{query}”.</div>
                  <button type="button" onClick={() => setQuery("")} style={styles.emptyBtn}>
                    Limpiar búsqueda
                  </button>
                </div>
              ) : (
                <div style={styles.resultsGrid}>
                  {filteredSubModules.map((sub) => (
                    <div
                      key={`${sub.parentKey}:${sub.path}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => go(sub.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") go(sub.path);
                      }}
                      onMouseEnter={() => setHovered("sub-" + sub.path)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        ...styles.subModuleRow,
                        ...(hovered === "sub-" + sub.path ? styles.subModuleRowHover : {}),
                      }}
                    >
                      <SidebarAreaIcon img={sub.parentImg} fallback={sub.parentIcon} />
                      <div style={styles.subModuleInfo}>
                        <span style={styles.subModuleLabel}>{sub.label}</span>
                        <span style={styles.subModuleParent}>{sub.parentTitle}</span>
                      </div>
                      <ArrowRight
                        size={14}
                        strokeWidth={2.2}
                        color={hovered === "sub-" + sub.path ? T.accent : T.textMuted}
                        style={{ transition: "color 150ms ease" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section style={styles.wheelSection}>
              <div
                className="hh-wheel"
                style={{
                  ...styles.wheel,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "scale(1)" : "scale(0.96)",
                }}
              >
                {/* subtle outer ring */}
                <div style={styles.outerRing} aria-hidden="true" />

                {/* sectors: inactive first (base circle), then the active one
                    expanded beyond the rim on top */}
                <svg style={styles.sectors} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {wedges
                    .filter((w) => hovered !== w.key)
                    .map((w) => (
                      <path
                        key={w.key}
                        d={w.d}
                        fill="transparent"
                        stroke={T.border}
                        strokeWidth={0.45}
                        strokeLinejoin="round"
                      />
                    ))}
                  {wedges
                    .filter((w) => hovered === w.key)
                    .map((w) => (
                      <g key={w.key}>
                        {/* white base fills the extension with the wheel look */}
                        <path d={w.dActive} fill="#FFFFFF" stroke="none" />
                        {/* soft accent overlay */}
                        <path d={w.dActive} fill={w.soft} stroke="none" style={{ transition: "fill 200ms ease" }} />
                        {/* dashed arc just before (inward of) the grey arc */}
                        <path
                          d={w.dDash}
                          fill="none"
                          stroke={T.textMuted}
                          strokeWidth={0.38}
                          strokeLinecap="round"
                          strokeDasharray="0.9 1.6"
                        />
                        {/* grey arc echoing the normal rim curvature, on top of the fill */}
                        <path
                          d={w.dArc}
                          fill="none"
                          stroke={T.border}
                          strokeWidth={0.7}
                          strokeLinecap="round"
                        />
                        {/* outer + inner + radial borders in the action accent, on top */}
                        <path
                          d={w.dActive}
                          fill="none"
                          stroke={w.accent}
                          strokeWidth={0.7}
                          strokeLinejoin="round"
                        />
                      </g>
                    ))}
                </svg>

                {/* inner ring around the core */}
                <div style={styles.innerRing} aria-hidden="true" />

                {/* invisible quadrant hit areas — own the hover/focus/click so the
                    user doesn't have to aim exactly at the icon. Above the sectors,
                    below the central Asistente core. */}
                {nodes.map(({ action, x, y }) => (
                  <button
                    key={`hit-${action.key}`}
                    type="button"
                    onClick={() => handleMenuAction(action.key)}
                    onMouseEnter={() => setHovered(action.key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(action.key)}
                    onBlur={() => setHovered(null)}
                    aria-label={`Abrir ${action.title}`}
                    style={{
                      ...styles.hitArea,
                      left: x < 0 ? 0 : "50%",
                      top: y < 0 ? 0 : "50%",
                    }}
                  />
                ))}

                {/* fixed action icons placed radially (visual only) */}
                {nodes.map(({ action, x, y }, i) => (
                  <ActionNode
                    key={action.key}
                    action={action}
                    x={x}
                    y={y}
                    delay={140 + i * 55}
                    mounted={mounted}
                    hovered={hovered}
                    badge={action.key === "areas" ? areas.length : null}
                  />
                ))}

                {/* central configuration core */}
                <button
                  type="button"
                  onClick={() => nav("/welcome")}
                  onMouseEnter={() => setHovered("__core__")}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered("__core__")}
                  onBlur={() => setHovered(null)}
                  style={{
                    ...styles.core,
                    transform: `translate(-50%, -50%) scale(${mounted ? (hovered === "__core__" ? 1.04 : 1) : 0.5})`,
                    boxShadow:
                      hovered === "__core__"
                        ? `0 16px 44px ${T.accentGlow}, 0 0 0 6px rgba(255,255,255,0.9)`
                        : `0 10px 30px ${T.accentGlow}, 0 0 0 6px rgba(255,255,255,0.9)`,
                  }}
                  title="Asistente"
                  aria-label="Asistente"
                >
                  <img src={imgApolo} alt="" style={styles.coreImg} draggable={false} />
                  <span style={styles.coreLabel}>Asistente</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Áreas modal (Encarta-style) */}
      {areasModalOpen && (
        <AreasModal
          areas={areas}
          onClose={() => setAreasModalOpen(false)}
          onNavigate={nav}
          onComingSoon={setComingSoonArea}
        />
      )}

      {/* Coming-soon dialog */}
      {comingSoonArea && (
        <div style={styles.modalBackdrop} onClick={() => setComingSoonArea(null)}>
          <div
            style={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={comingSoonArea.title}
          >
            <div style={styles.modalIcon}>
              <Info size={24} strokeWidth={2.2} color={T.accent} />
            </div>
            <div style={styles.modalChip}>Próximamente</div>
            <h3 style={styles.modalTitleSoon}>{comingSoonArea.title}</h3>
            <p style={styles.modalText}>
              {comingSoonArea.comingSoonMsg || "Esta área estará disponible próximamente."}
            </p>
            <button type="button" onClick={() => setComingSoonArea(null)} style={styles.modalBtn}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── CSS Animations + responsive layout ─── */
const cssAnimations = `
  @keyframes homeSpin { to { transform: rotate(360deg); } }
  @keyframes hhFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes hhPop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  * { box-sizing: border-box; }
  input::placeholder { color: ${T.textMuted}; }

  /* Circular menu sizing — stable on laptop, scaled down on smaller screens. */
  .hh-wheel { --areas-wheel-size: clamp(500px, 46vw, 640px); }
  @media (max-width: 900px) {
    .hh-wheel { --areas-wheel-size: clamp(420px, 78vw, 560px); }
  }
  @media (max-width: 560px) {
    .hh-wheel { --areas-wheel-size: min(92vw, 420px); }
  }

  .hh-modal {
    width: min(1180px, 96vw);
    height: min(760px, calc(100vh - 40px));
  }
  .hh-modal-body {
    display: grid;
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr) minmax(190px, 230px);
    gap: 14px;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    padding: 14px;
  }
  .hh-modal-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding: 2px;
  }
  .hh-modal-center { min-width: 0; overflow-y: auto; }
  .hh-area-card { width: 100%; }
  .hh-mod-btn:hover { filter: brightness(0.98); }

  @media (max-width: 880px) {
    .hh-modal { width: 96vw; height: min(760px, calc(100vh - 24px)); }
    .hh-modal-body { grid-template-columns: 1fr; overflow-y: auto; }
    .hh-modal-side { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; flex: 0 0 auto; }
    .hh-modal-side .hh-area-card { width: auto; flex: 0 0 auto; min-width: 180px; }
    .hh-modal-center { overflow: visible; }
  }
  @media (max-width: 560px) {
    .hh-brand-text { display: none !important; }
    .hh-userpill-name { display: none !important; }
  }
`;

/* ─── Styles ─── */
/* Stable laptop size; the actual value is driven by the --areas-wheel-size
   CSS variable (see cssAnimations) so media queries can scale it down. */
const WHEEL_SIZE = "var(--areas-wheel-size, clamp(500px, 46vw, 640px))";

const styles = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    background: T.bg,
    fontFamily: T.font,
    color: T.text,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    position: "relative",
  },

  /* Header */
  header: {
    width: "100%",
    borderBottom: `1px solid ${T.border}`,
    background: "rgba(255,255,255,0.82)",
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
    textDecoration: "none",
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
    padding: "24px 24px 32px",
    WebkitOverflowScrolling: "touch",
  },
  container: { maxWidth: 1200, margin: "0 auto", display: "grid", gap: 22 },

  /* Hero (card) */
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    padding: "26px 30px",
    borderRadius: 22,
    background: `linear-gradient(135deg, #fff 0%, ${T.accentSoft} 150%)`,
    border: `1px solid ${T.border}`,
    boxShadow: T.shadow,
    transition: "opacity 400ms ease, transform 400ms ease",
  },
  heroText: { display: "grid", gap: 10, minWidth: 0, flex: "1 1 300px" },
  heroLogoWrap: { display: "grid", placeItems: "center", flexShrink: 0 },
  heroLogo: { width: "clamp(96px, 14vw, 150px)", height: "auto", objectFit: "contain", opacity: 0.96 },
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
  greetingDot: { width: 7, height: 7, borderRadius: 999, background: T.accent, boxShadow: `0 0 0 3px ${T.accentSoft}` },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(24px, 3.6vw, 34px)",
    fontWeight: 850,
    color: T.text,
    letterSpacing: -0.6,
    lineHeight: 1.1,
  },
  heroSubtitle: { margin: 0, fontSize: 15, fontWeight: 500, color: T.textSecondary, lineHeight: 1.5, maxWidth: 480 },

  /* Search row (below the hero) */
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    transition: "opacity 400ms ease, transform 400ms ease",
  },

  /* Search */
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    boxShadow: T.shadow,
    width: "min(320px, 78vw)",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  },
  searchWrapFocus: { borderColor: T.accent, boxShadow: `0 0 0 4px ${T.accentSoft}` },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    fontWeight: 500,
    color: T.text,
    fontFamily: "inherit",
    minWidth: 0,
  },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "none",
    background: T.surfaceAlt,
    color: T.textSecondary,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
    fontFamily: "inherit",
  },
  heroBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: T.textMuted,
    padding: "5px 12px",
    borderRadius: 999,
    background: T.surface,
    border: `1px solid ${T.border}`,
  },

  /* ─── Circular menu ─── */
  wheelSection: { display: "grid", placeItems: "center", padding: "clamp(8px, 3vh, 28px) 0 24px" },
  wheel: {
    position: "relative",
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    flexShrink: 0,
    borderRadius: "50%",
    background: "radial-gradient(circle at 50% 40%, #FFFFFF 0%, #FFFFFF 56%, #F4F7FB 100%)",
    border: `1px solid ${T.border}`,
    boxShadow: "inset 0 1px 0 #fff, 0 22px 60px rgba(15,23,42,0.12), 0 6px 18px rgba(15,23,42,0.05)",
    transition: "opacity 520ms ease, transform 520ms cubic-bezier(0.22,1,0.36,1)",
    overflow: "visible", // let the active sector grow beyond the base circle
  },
  outerRing: {
    position: "absolute",
    inset: "5%",
    borderRadius: "50%",
    border: `1px dashed ${T.border}`,
    opacity: 0.7,
    pointerEvents: "none",
  },
  sectors: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" },
  /* Invisible quadrant interaction zone (one per action). */
  hitArea: {
    position: "absolute",
    width: "50%",
    height: "50%",
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    zIndex: 4,
    fontFamily: "inherit",
  },
  innerRing: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "44%",
    height: "44%",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: "radial-gradient(circle, #FFFFFF 60%, rgba(255,255,255,0) 100%)",
    border: `1px solid ${T.borderSoft}`,
    boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
    pointerEvents: "none",
    zIndex: 3,
  },
  node: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "clamp(72px, 14vw, 96px)",
    transformOrigin: "center center",
    transition: "opacity 420ms ease, transform 360ms cubic-bezier(0.22,1,0.36,1)",
    // native button reset (the whole node is a <button> now)
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
  },
  nodeBtn: {
    position: "relative",
    width: "clamp(72px, 14vw, 96px)",
    height: "clamp(72px, 14vw, 96px)",
    borderRadius: "50%",
    border: `1.5px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    transition: "all 200ms cubic-bezier(0.22,1,0.36,1)",
  },
  nodeIcon: { width: "72%", height: "72%", borderRadius: "50%", display: "grid", placeItems: "center" },
  nodeBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    borderRadius: 999,
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
    border: "2px solid #fff",
    lineHeight: 1,
  },
  /* Floating tooltip label (hover/focus only) */
  nodeTip: {
    position: "absolute",
    left: "50%",
    padding: "5px 12px",
    borderRadius: 999,
    color: "#fff",
    fontSize: "clamp(11px, 1.4vw, 13px)",
    fontWeight: 700,
    letterSpacing: -0.1,
    whiteSpace: "nowrap",
    boxShadow: T.shadowMd,
    pointerEvents: "none",
    zIndex: 12,
    transition: "opacity 160ms ease, transform 160ms ease",
  },
  nodeTipBottom: { top: "calc(100% + 8px)" },
  nodeTipTop: { bottom: "calc(100% + 8px)" },
  core: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "30%",
    height: "30%",
    borderRadius: "50%",
    border: "none",
    background: `radial-gradient(circle at 50% 32%, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2%",
    cursor: "pointer",
    color: "#fff",
    transition: "transform 260ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease",
    zIndex: 10,
  },
  coreImg: { width: "62%", height: "62%", objectFit: "contain" },
  coreLabel: { fontSize: "clamp(11px, 2.1vw, 15px)", fontWeight: 800, letterSpacing: 0.2, color: "#fff", whiteSpace: "nowrap" },

  /* ─── Search results (secondary panel) ─── */
  resultsSection: { display: "grid", gap: 14, transition: "opacity 400ms ease, transform 400ms ease" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: -0.2 },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: T.accent,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10 },
  subModuleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    cursor: "pointer",
    transition: "all 180ms ease",
    outline: "none",
  },
  subModuleRowHover: { borderColor: T.accent, boxShadow: T.shadow, transform: "translateX(2px)" },
  subModuleInfo: { flex: 1, display: "grid", gap: 2, minWidth: 0 },
  subModuleLabel: { fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 },
  subModuleParent: { fontSize: 11, fontWeight: 500, color: T.textMuted, lineHeight: 1.2 },

  emptyState: {
    display: "grid",
    justifyItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "48px 24px",
    background: T.surface,
    border: `1px dashed ${T.border}`,
    borderRadius: 18,
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 14, background: T.surfaceAlt, display: "grid", placeItems: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: 800, color: T.text },
  emptyText: { fontSize: 13, fontWeight: 500, color: T.textMuted, maxWidth: 320 },
  emptyBtn: {
    marginTop: 8,
    padding: "9px 18px",
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* ─── Areas modal ─── */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "grid",
    placeItems: "center",
    padding: "20px",
    zIndex: 1000,
    animation: "hhFadeIn 180ms ease",
  },
  modal: {
    background: T.surface,
    borderRadius: 22,
    border: `1px solid ${T.border}`,
    boxShadow: "0 30px 80px rgba(15,23,42,0.30)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "hhPop 220ms cubic-bezier(0.22,1,0.36,1)",
  },
  modalHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px",
    borderBottom: `1px solid ${T.borderSoft}`,
    flexShrink: 0,
  },
  modalHeadTitle: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  modalHeadIcon: { width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0 },
  modalTitle: { fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  modalSubtitle: { fontSize: 12.5, fontWeight: 600, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    flexShrink: 0,
    padding: 0,
  },
  areaCard: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "11px 14px",
    minHeight: 60,
    borderRadius: 14,
    border: `1px solid ${T.border}`,
    background: T.surface,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
    flexShrink: 0,
  },
  areaCardIcon: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  areaCardImg: { width: 30, height: 30, objectFit: "contain" },
  areaCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 700,
    letterSpacing: -0.2,
    lineHeight: 1.15,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  center: {
    borderRadius: 18,
    border: `1px solid ${T.border}`,
    padding: "20px 20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  centerHero: { display: "flex", alignItems: "center", gap: 14 },
  centerIcon: { width: 60, height: 60, borderRadius: 16, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  centerImg: { width: 46, height: 46, objectFit: "contain" },
  centerTag: { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.2, marginBottom: 6 },
  centerTitle: { margin: 0, fontSize: 22, fontWeight: 850, color: T.text, letterSpacing: -0.5, lineHeight: 1.1 },
  centerDesc: { margin: 0, fontSize: 14, fontWeight: 500, color: T.textSecondary, lineHeight: 1.55 },
  centerCta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 800,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontFamily: "inherit",
  },
  modulesWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 2,
    alignItems: "start",
  },
  modBlock: { display: "flex", flexDirection: "column", gap: 6, minHeight: 48 },
  modBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "filter 150ms ease",
  },
  modDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  modLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  featuresRow: { display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 8 },
  featureChip: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid",
    background: "#fff",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 150ms ease",
  },
  modEmpty: { fontSize: 13, fontWeight: 600, color: T.textMuted, padding: "8px 2px" },

  modalEmpty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "48px 24px",
    textAlign: "center",
  },
  modalEmptyIcon: { width: 64, height: 64, borderRadius: 18, display: "grid", placeItems: "center", background: T.surfaceAlt, color: T.textMuted },
  modalEmptyTitle: { fontSize: 17, fontWeight: 800, color: T.text },
  modalEmptyDesc: { fontSize: 13.5, fontWeight: 500, color: T.textMuted, maxWidth: 320, lineHeight: 1.5 },

  /* Coming-soon modal */
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 30060 },
  modalCard: {
    width: "min(420px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: `1px solid ${T.border}`,
    boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
    padding: "26px 22px 20px",
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: 8,
  },
  modalIcon: { width: 54, height: 54, borderRadius: 16, background: T.accentSoft, display: "grid", placeItems: "center", marginBottom: 2 },
  modalChip: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: T.accent,
    background: T.accentSoft,
    padding: "4px 12px",
    borderRadius: 999,
  },
  modalTitleSoon: { margin: 0, fontSize: 18, fontWeight: 850, color: T.text, letterSpacing: -0.3 },
  modalText: { margin: 0, fontSize: 13.5, fontWeight: 500, color: T.textSecondary, lineHeight: 1.5, maxWidth: 340 },
  modalBtn: {
    marginTop: 12,
    padding: "11px 20px",
    borderRadius: 12,
    border: "none",
    background: T.accent,
    color: "#fff",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 8px 22px ${T.accentGlow}`,
  },
};
