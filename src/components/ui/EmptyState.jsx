import React from "react";
import { BORDER, SHADOW_CARD, SLATE, TEXT } from "../../styles/theme";

/**
 * Empty / placeholder state.
 *
 *   <EmptyState
 *     title="Sin resultados"
 *     description="Ajustá los filtros o agregá una nueva acción."
 *     action={<PrimaryButton onClick={create}>Nueva acción</PrimaryButton>}
 *   />
 */
export default function EmptyState({ icon: Icon, title, description, action, center = false, style }) {
  return (
    <div style={{ ...wrap, ...(center ? centerWrap : {}), ...style }}>
      {Icon ? (
        <div style={iconBox}>
          <Icon size={22} strokeWidth={2.2} color={SLATE} />
        </div>
      ) : null}
      {title ? <div style={titleStyle}>{title}</div> : null}
      {description ? <div style={{ ...text, ...(center ? { maxWidth: 380 } : {}) }}>{description}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

const wrap = {
  padding: 16,
  borderRadius: 16,
  border: `1px solid ${BORDER}`,
  backgroundColor: "var(--c-surface-soft, #FBFCFF)",
  boxShadow: SHADOW_CARD,
  display: "grid",
  gap: 6,
  justifyItems: "start",
};
const centerWrap = {
  padding: "32px 20px",
  justifyItems: "center",
  textAlign: "center",
};
const iconBox = {
  width: 44,
  height: 44,
  borderRadius: 14,
  background: "var(--c-surface-inset, #F1F5F9)",
  border: `1px solid ${BORDER}`,
  display: "grid",
  placeItems: "center",
  marginBottom: 4,
};
const titleStyle = { color: TEXT, fontWeight: 980, fontSize: 14 };
const text = { color: SLATE, fontWeight: 850, fontSize: 13, lineHeight: 1.35 };
