import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, LayoutGrid, Pin, Search } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { isEpaRestrictedUser } from "../../config/epaOnlyUids";
import { getVisibleAreas } from "../../config/workAreas";
import { OPEN_COMMAND_PALETTE_EVENT, openCommandPalette, onCommandPaletteClose } from "./commandPaletteBus";
import AreasSidebar from "./AreasSidebar";
import AreasModal from "./AreasModal";
import { openAssistantModal } from "./assistantBus";
import {
  ACCENT,
  ACCENT_SHADOW,
  accentAlpha,
  BORDER,
  FONT_STACK,
  MUTED,
  SLATE_DEEP,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../styles/theme";
import imgApolo from "../../assets/Apolo.png";

const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: accentAlpha(0.1),
  accentGlow: ACCENT_SHADOW,
  surface: SURFACE,
  surfaceAlt: SURFACE_INSET,
  border: BORDER,
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  font: FONT_STACK,
};

/* Radial geometry */
const RING_RADIUS = 34;
const WEDGE_RADIUS = 48;

/* Fixed menu actions */
const MENU_ACTIONS = [
  { key: "areas", title: "Áreas", icon: <LayoutGrid />, angle: 225, accent: "#2563EB", soft: "rgba(37,99,235,0.12)" },
  { key: "pins", title: "Mis Pin", icon: <Pin />, angle: 315, accent: ACCENT, soft: accentAlpha(0.12) },
  { key: "reportes", title: "Reportes", icon: <BarChart3 />, angle: 135, accent: "#7C3AED", soft: "rgba(124,58,237,0.12)" },
  { key: "configuracion", title: "Buscar", icon: <Search />, angle: 45, accent: "#EA580C", soft: "rgba(234,88,12,0.12)" },
];

/* Simple sector path for divider lines only (no expand) */
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

/* Action node — icon + always-visible label */
function ActionNode({ action, x, y, hovered, badge }) {
  const isHover = hovered === action.key;
  return (
    <div
      aria-hidden="true"
      style={{
        ...S.nodeWrap,
        left: `calc(50% + ${x}%)`,
        top: `calc(50% + ${y}%)`,
        zIndex: isHover ? 9 : 6,
      }}
    >
      <div style={S.node}>
        <span
          style={{
            ...S.nodeBtn,
            borderColor: isHover ? action.accent : T.border,
            background: isHover ? action.soft : T.surface,
            boxShadow: isHover ? `${T.shadowMd}, 0 0 0 4px ${action.soft}` : T.shadow,
          }}
        >
          <span style={{ ...S.nodeIcon, background: isHover ? "transparent" : action.soft, color: action.accent }}>
            {React.cloneElement(action.icon, { size: "52%", strokeWidth: 2 })}
          </span>
          {badge != null && <span style={{ ...S.nodeBadge, background: action.accent }}>{badge}</span>}
        </span>
        {/* Always-visible label */}
        <span style={{ ...S.nodeLabel, color: isHover ? action.accent : T.textSecondary }}>
          {action.title}
        </span>
      </div>
    </div>
  );
}

export default function CircleMenu() {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPins, setSidebarPins] = useState(false);
  const [areasModalOpen, setAreasModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const areas = useMemo(() => {
    if (!user) return [];
    const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
    return getVisibleAreas({ epaOnly, role }).filter((a) => !a.blocked);
  }, [user, profile, epaAdmin, role]);

  useEffect(() => {
    const openMenu = () => { if (!searchOpen) setOpen(true); };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        openMenu();
      }
      if (e.key === "Escape" && open && !sidebarOpen && !areasModalOpen && !searchOpen) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openMenu);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openMenu);
    };
  }, [open, sidebarOpen, areasModalOpen, searchOpen]);

  // Reset searchOpen when CommandPalette closes
  useEffect(() => {
    return onCommandPaletteClose(() => setSearchOpen(false));
  }, []);

  const { nodes, wedges } = useMemo(() => {
    const span = (2 * Math.PI) / MENU_ACTIONS.length;
    const nodes = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return { action, x: RING_RADIUS * Math.cos(ang), y: RING_RADIUS * Math.sin(ang) };
    });
    const wedges = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return { key: action.key, d: sectorPath(ang, span) };
    });
    return { nodes, wedges };
  }, []);

  if (!open || !user) return null;

  const close = () => {
    setOpen(false);
    setHovered(null);
    setSidebarOpen(false);
    setSidebarPins(false);
    setAreasModalOpen(false);
  };

  const handleMenuAction = (key) => {
    switch (key) {
      case "areas":
        setAreasModalOpen(true);
        break;
      case "pins":
        setSidebarPins(true);
        setSidebarOpen(true);
        break;
      case "configuracion":
        setSearchOpen(true);
        openCommandPalette();
        break;
      case "reportes":
        close();
        nav("/reportes");
        break;
      default:
        break;
    }
  };

  const handleCore = () => {
    close();
    openAssistantModal();
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSidebarPins(false);
  };

  return (
    <div style={S.root}>
      <style>{cssKeyframes}</style>

      <AreasSidebar open={sidebarOpen} openPins={sidebarPins} onClose={closeSidebar} />

      {areasModalOpen && (
        <AreasModal
          areas={areas}
          onClose={() => setAreasModalOpen(false)}
          onNavigate={(path) => { close(); nav(path); }}
          onComingSoon={() => setAreasModalOpen(false)}
        />
      )}

      <button type="button" aria-label="Cerrar" onClick={close} style={S.backdrop} />

      <div className="cm-wheel" role="dialog" aria-modal="true" aria-label="Menú rápido" style={S.wheel}>
        <div style={S.outerRing} aria-hidden="true" />

        {/* Simple sector divider lines (no expand effect) */}
        <svg style={S.sectors} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {wedges.map((w) => (
            <path key={w.key} d={w.d} fill="transparent" stroke={T.border} strokeWidth={0.4} strokeLinejoin="round" />
          ))}
        </svg>

        <div style={S.innerRing} aria-hidden="true" />

        {/* Quadrant hit areas */}
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
            style={{ ...S.hitArea, left: x < 0 ? 0 : "50%", top: y < 0 ? 0 : "50%" }}
          />
        ))}

        {/* Action nodes with labels */}
        {nodes.map(({ action, x, y }) => (
          <ActionNode key={action.key} action={action} x={x} y={y} hovered={hovered} badge={action.key === "areas" ? areas.length : null} />
        ))}

        {/* Central core */}
        <button
          type="button"
          onClick={handleCore}
          onMouseEnter={() => setHovered("__core__")}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...S.core,
            transform: `translate(-50%, -50%) scale(${hovered === "__core__" ? 1.04 : 1})`,
            boxShadow: hovered === "__core__"
              ? `0 16px 44px ${T.accentGlow}, 0 0 0 6px rgba(255,255,255,0.9)`
              : `0 10px 30px ${T.accentGlow}, 0 0 0 6px rgba(255,255,255,0.9)`,
          }}
          title="Asistente"
          aria-label="Asistente"
        >
          <img src={imgApolo} alt="" style={S.coreImg} draggable={false} />
          <span style={S.coreLabel}>Asistente</span>
        </button>
      </div>

      <div style={S.hintBar}>
        <span style={S.hintText}><kbd style={S.kbd}>Esc</kbd> cerrar</span>
      </div>
    </div>
  );
}

const cssKeyframes = `
  @keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cmWheelIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  .cm-wheel { --cm-wheel-size: min(520px, 72vmin); }
  @media (max-width: 560px) { .cm-wheel { --cm-wheel-size: min(90vw, 420px); } }
`;

const WHEEL_CSS_SIZE = "var(--cm-wheel-size, min(520px, 72vmin))";

const S = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 30040,
    display: "grid",
    placeItems: "center",
    fontFamily: T.font,
    animation: "cmFadeIn 200ms ease",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "none",
    cursor: "pointer",
  },
  wheel: {
    position: "relative",
    width: WHEEL_CSS_SIZE,
    height: WHEEL_CSS_SIZE,
    flexShrink: 0,
    borderRadius: "50%",
    background: "radial-gradient(circle at 50% 40%, #FFFFFF 0%, #FFFFFF 56%, #F4F7FB 100%)",
    border: `1px solid ${T.border}`,
    boxShadow: "inset 0 1px 0 #fff, 0 22px 60px rgba(15,23,42,0.18), 0 6px 18px rgba(15,23,42,0.08)",
    overflow: "visible",
    animation: "cmWheelIn 360ms cubic-bezier(0.22,1,0.36,1)",
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
    outline: "none",
    WebkitTapHighlightColor: "transparent",
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
  nodeWrap: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  },
  node: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "clamp(80px, 16vw, 110px)",
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    fontFamily: "inherit",
  },
  nodeBtn: {
    position: "relative",
    width: "clamp(64px, 12vw, 80px)",
    height: "clamp(64px, 12vw, 80px)",
    borderRadius: "50%",
    border: `1.5px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    padding: 0,
    transition: "all 200ms ease",
  },
  nodeIcon: { width: "70%", height: "70%", borderRadius: "50%", display: "grid", placeItems: "center" },
  nodeBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 999,
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
    border: "2px solid #fff",
    lineHeight: 1,
  },
  nodeLabel: {
    fontSize: 11,
    fontWeight: 750,
    letterSpacing: -0.1,
    whiteSpace: "nowrap",
    textAlign: "center",
    transition: "color 150ms ease",
  },
  core: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "28%",
    height: "28%",
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
  coreImg: { width: "58%", height: "58%", objectFit: "contain" },
  coreLabel: { fontSize: "clamp(11px, 2vw, 14px)", fontWeight: 800, letterSpacing: 0.2, color: "#fff", whiteSpace: "nowrap" },
  hintBar: {
    position: "fixed",
    bottom: 28,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 16,
    padding: "8px 16px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.12)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.15)",
  },
  hintText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.8)",
  },
  kbd: {
    display: "inline-grid",
    placeItems: "center",
    minWidth: 20,
    height: 20,
    padding: "0 5px",
    borderRadius: 5,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.2)",
    fontSize: 10,
    fontWeight: 800,
    color: "#fff",
  },
};
