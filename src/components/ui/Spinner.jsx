import React from "react";
import { ACCENT, SLATE } from "../../styles/theme";

/**
 * Loading spinner. Uses the global `@keyframes spin` already defined in src/index.css.
 *
 *   <Spinner />
 *   <Spinner label="Cargando acciones..." />
 *   <Spinner size={20} inline />
 */
export default function Spinner({ size = 30, label, inline = false, style }) {
  const dot = (
    <span
      style={{
        ...spinnerBase,
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 10)),
        ...style,
      }}
    />
  );

  if (inline) return dot;

  return (
    <div style={center}>
      {dot}
      {label ? <div style={loadingText}>{label}</div> : null}
    </div>
  );
}

const center = { minHeight: 200, display: "grid", placeItems: "center", gap: 10 };
const spinnerBase = {
  display: "inline-block",
  borderRadius: 999,
  border: "3px solid rgba(15,23,42,0.12)",
  borderTopColor: ACCENT,
  animation: "spin 0.9s linear infinite",
};
const loadingText = { color: SLATE, fontWeight: 850 };
