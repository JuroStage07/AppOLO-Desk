import React from "react";
import { BORDER, SHADOW_SOFT, TEXT } from "../../styles/theme";

/**
 * Filter chip — toggleable.
 *
 *   <ChipsRow>
 *     {options.map(o => (
 *       <Chip key={o.id} active={o.id === active} onClick={() => setActive(o.id)}>
 *         {o.label}
 *       </Chip>
 *     ))}
 *   </ChipsRow>
 */
export default function Chip({ active = false, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...chip, ...(active ? chipOn : {}), ...style }}
    >
      <span style={{ ...txt, ...(active ? txtOn : {}) }}>{children}</span>
    </button>
  );
}

export function ChipsRow({ children, style }) {
  return <div style={{ ...row, ...style }}>{children}</div>;
}

const row = { display: "flex", flexWrap: "wrap", gap: 8 };

const chip = {
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  padding: "8px 12px",
  cursor: "pointer",
  boxShadow: SHADOW_SOFT,
  fontFamily: "inherit",
};
const chipOn = { background: "#0F172A", borderColor: "#0F172A" };
const txt = { fontWeight: 950, fontSize: 12, color: TEXT };
const txtOn = { color: "#fff" };
