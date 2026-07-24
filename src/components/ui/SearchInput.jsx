import React from "react";
import { Search, X } from "lucide-react";
import { BORDER, MUTED, SHADOW_SOFT, TEXT } from "../../styles/theme";

/**
 * Search row with leading icon and a clear button.
 *
 *   <SearchInput value={q} onChange={setQ} placeholder="Buscar acción..." />
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  autoFocus,
  style,
}) {
  return (
    <div style={{ ...row, ...style }}>
      <span style={icon}>
        <Search size={16} strokeWidth={2.2} />
      </span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={input}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpiar"
          onClick={() => onChange?.("")}
          style={clearBtn}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

const row = {
  backgroundColor: "var(--c-surface, #ffffff)",
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  padding: "10px 10px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  boxShadow: SHADOW_SOFT,
};
const icon = { width: 22, display: "grid", placeItems: "center", color: MUTED };
const input = {
  flex: 1,
  border: "none",
  outline: "none",
  fontWeight: 850,
  color: TEXT,
  background: "transparent",
  minWidth: 0,
};
const clearBtn = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: "var(--c-surface, #fff)",
  cursor: "pointer",
  color: "#64748B",
  display: "grid",
  placeItems: "center",
};
