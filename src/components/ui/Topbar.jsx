import React from "react";
import { User } from "lucide-react";
import { ACCENT, ACCENT_SOFT, BORDER, CONTAINER_MAX, SLATE, TEXT } from "../../styles/theme";

/**
 * Sticky top bar. Compose with <Brand/> on the left and any actions on the right.
 *
 * Example:
 *   <Topbar>
 *     <Brand title="Recepción" subtitle="Panel de módulos" icon={Truck} onClick={...} />
 *     <Topbar.Right>
 *       <UserHint>{user.email}</UserHint>
 *       <GhostButton icon={ArrowLeft} onClick={goHome}>Inicio</GhostButton>
 *     </Topbar.Right>
 *   </Topbar>
 */
export default function Topbar({ children, style, innerStyle, sticky = false }) {
  return (
    <header style={{ ...topbar, ...(sticky ? topbarSticky : {}), ...style }}>
      <div style={{ ...topbarInner, ...innerStyle }}>{children}</div>
    </header>
  );
}

function Right({ children, style }) {
  return <div style={{ ...topbarRight, ...style }}>{children}</div>;
}
Topbar.Right = Right;

function UserHint({ children, title, style }) {
  if (!children) return null;
  return (
    <div style={{ ...userHint, ...style }} title={title}>
      {children}
    </div>
  );
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

const topbar = {
  width: "100%",
  boxSizing: "border-box",
  borderBottom: `1px solid ${BORDER}`,
  background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
  backdropFilter: "blur(8px)",
};

const topbarSticky = {
  position: "sticky",
  top: 0,
  zIndex: 100,
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

const userHint = {
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
  fontWeight: 800,
  fontSize: 12,
  color: TEXT,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const userMail = {
  fontWeight: 650,
  fontSize: 11,
  color: SLATE,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
