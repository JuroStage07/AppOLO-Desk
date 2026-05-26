import React, { useState } from "react";
import { BORDER, MUTED, SLATE, SHADOW_CARD, SHADOW_CARD_HOVER, TEXT } from "../../styles/theme";

/**
 * Horizontal "list row" card. Use for clickable list items (acciones, OTs, etc.).
 *
 *   <RowCard
 *     title="OT 0001"
 *     desc="Mantenimiento preventivo"
 *     meta="Hace 2h"
 *     extra={<StatusPill tone="ok">Completa</StatusPill>}
 *     onClick={...}
 *   />
 */
export default function RowCard({
  title,
  desc,
  meta,
  extra,
  right,
  onClick,
  children,
  style,
}) {
  const [hover, setHover] = useState(false);
  const interactive = typeof onClick === "function";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e);
        }
      }}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        ...rowCard,
        ...(hover ? rowCardHover : {}),
        cursor: interactive ? "pointer" : "default",
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <div style={rowTitle}>{title}</div> : null}
        {desc ? <div style={rowDesc}>{desc}</div> : null}
        {meta ? <div style={rowMeta}>{meta}</div> : null}
        {children}
      </div>
      {extra ? <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{extra}</div> : null}
      {right}
    </div>
  );
}

const rowCard = {
  backgroundColor: "#ffffff",
  borderRadius: 16,
  padding: 14,
  border: `1px solid ${BORDER}`,
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 92,
  boxShadow: SHADOW_CARD,
  userSelect: "none",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};
const rowCardHover = {
  transform: "translateY(-2px)",
  boxShadow: SHADOW_CARD_HOVER,
};

const rowTitle = {
  color: TEXT,
  fontSize: 15,
  fontWeight: 980,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};
const rowDesc = { color: SLATE, marginTop: 4, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis" };
const rowMeta = { color: MUTED, marginTop: 6, fontSize: 12, fontWeight: 850 };
