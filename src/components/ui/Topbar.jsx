import React, { useState } from "react";
import { Menu, User } from "lucide-react";
import AreasSidebar from "./AreasSidebar";
import { ACCENT, ACCENT_SOFT, BORDER, CONTAINER_MAX, SLATE, TEXT } from "../../styles/theme";

const SURFACE = "#FFFFFF";

/**
 * Sticky top bar with the integrated, app-wide "Áreas de trabajo" sidebar.
 * The sidebar data lives in src/config/workAreas and is shared with the
 * Áreas hub page, so the menu is identical everywhere.
 */
export default function Topbar({ children, style, innerStyle, sticky = true }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
