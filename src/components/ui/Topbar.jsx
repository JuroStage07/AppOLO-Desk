import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, User, Search } from "lucide-react";
import AreasSidebar from "./AreasSidebar";
import Breadcrumbs from "./Breadcrumbs";
import { isRootPath } from "./routeTrail";
import TopbarAccount from "./TopbarAccount";
import { openCommandPalette } from "./commandPaletteBus";
import { ACCENT, ACCENT_SOFT, BORDER, CONTAINER_MAX, SLATE, SURFACE, TEXT } from "../../styles/theme";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
const CMD_HINT = IS_MAC ? "⌘K" : "Ctrl K";

/**
 * Sticky top bar with the integrated, app-wide "Áreas de trabajo" sidebar.
 * The sidebar data lives in src/config/workAreas and is shared with the
 * Áreas hub page, so the menu is identical everywhere.
 *
 * Below the main row it renders a slim utility sub-bar with route-aware
 * breadcrumbs (Inicio › Área › Sección › Detalle) on the left and the account
 * + "Cerrar sesión" control on the right, so both are consistent on every inner
 * page. Pass `utilityBar={false}` to opt out on a page.
 */
export default function Topbar({
  children,
  style,
  innerStyle,
  sticky = true,
  utilityBar = true,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const showUtility = utilityBar && !isRootPath(location.pathname);

  return (
    <>
      <AreasSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header style={{ ...topbar, ...(sticky ? topbarPinned : {}), ...style }}>
        <div style={{ ...topbarInner, ...innerStyle }}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
          {children}
        </div>
        {showUtility ? (
          <div style={subBar}>
            <div style={subBarInner}>
              <Breadcrumbs />
              <div style={subBarRight}>
                <button
                  type="button"
                  onClick={openCommandPalette}
                  style={searchTrigger}
                  title="Buscar y navegar"
                  aria-label="Buscar y navegar"
                >
                  <Search size={14} strokeWidth={2.3} />
                  <span style={searchTriggerLabel}>Buscar</span>
                  <span style={searchTriggerKbd}>{CMD_HINT}</span>
                </button>
                <TopbarAccount />
              </div>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}

function Right({ children, style }) {
  return <div style={{ ...topbarRight, ...style }}>{children}</div>;
}
Topbar.Right = Right;

function UserHint({ children, title, style }) {
  if (!children) return null;
  return <div style={{ ...userHintStyle, ...style }} title={title}>{children}</div>;
}
Topbar.UserHint = UserHint;

function UserBox({ name, email, icon, style }) {
  if (!name && !email) return null;
  const AvatarIcon = icon || User;
  return (
    <div style={{ ...userBox, ...style }}>
      <div style={userAvatar}>
        <AvatarIcon size={16} strokeWidth={2.2} />
      </div>
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        {name ? <div style={userName}>{name}</div> : null}
        {email ? <div style={userMail}>{email}</div> : null}
      </div>
    </div>
  );
}
Topbar.UserBox = UserBox;

/* ─── Topbar styles ─── */
const topbar = {
  width: "100%",
  boxSizing: "border-box",
  flexShrink: 0,
  borderBottom: `1px solid ${BORDER}`,
  background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
/** Stays visible when an ancestor scrolls (custom shells, lockBodyScroll=false). */
const topbarPinned = { position: "sticky", top: 0, zIndex: 120 };
const subBar = {
  width: "100%",
  borderTop: `1px solid ${BORDER}`,
  background: "rgba(248,250,252,0.7)",
};
const subBarInner = {
  width: "100%",
  maxWidth: CONTAINER_MAX,
  marginLeft: "auto",
  marginRight: "auto",
  boxSizing: "border-box",
  padding: "6px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};
const subBarRight = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};
const searchTrigger = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 28,
  padding: "0 8px 0 10px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: SLATE,
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 12,
  flexShrink: 0,
};
const searchTriggerLabel = { lineHeight: 1 };
const searchTriggerKbd = {
  display: "inline-grid",
  placeItems: "center",
  padding: "1px 5px",
  borderRadius: 5,
  background: "#F1F5F9",
  border: `1px solid ${BORDER}`,
  fontSize: 10,
  fontWeight: 800,
  color: SLATE,
  lineHeight: 1.4,
};
const topbarInner = {
  width: "100%",
  maxWidth: CONTAINER_MAX,
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
};
const topbarRight = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};
const menuBtn = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: TEXT,
  transition: "all 150ms ease",
  fontFamily: "inherit",
  padding: 0,
  flexShrink: 0,
};
const userHintStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: SLATE,
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const userBox = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 12px 6px 6px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
  maxWidth: 220,
  minWidth: 0,
};
const userAvatar = {
  width: 36,
  height: 36,
  borderRadius: 12,
  background: ACCENT_SOFT,
  color: ACCENT,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const userName = {
  fontWeight: 800, fontSize: 12, color: TEXT, lineHeight: 1.2,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const userMail = {
  fontWeight: 650, fontSize: 11, color: SLATE, lineHeight: 1.2,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
