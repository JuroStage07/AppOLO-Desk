import React from "react";
import { ACCENT_SOFT, BORDER, SHADOW_SOFT, SLATE, TEXT } from "../../styles/theme";

/**
 * Tip / footer note panel (the "Tip" block at the bottom of Recepción home).
 *
 *   <FooterNote title="Tip">
 *     Si un módulo no abre, revisá permisos en tu perfil.
 *   </FooterNote>
 */
export default function FooterNote({ title = "Tip", children, style }) {
  return (
    <div style={{ ...wrap, ...style }}>
      <div style={titleStyle}>{title}</div>
      <div style={text}>{children}</div>
    </div>
  );
}

const wrap = {
  borderRadius: 18,
  border: `1px solid ${BORDER}`,
  background: "#FFFFFF",
  padding: 16,
  boxShadow: SHADOW_SOFT,
  borderTop: `3px solid ${ACCENT_SOFT}`,
};
const titleStyle = { fontWeight: 950, color: TEXT, marginBottom: 6, fontSize: 14 };
const text = { color: SLATE, fontWeight: 650, fontSize: 14, lineHeight: 1.5 };
