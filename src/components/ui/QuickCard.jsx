import React from "react";
import { useNavigate } from "react-router-dom";
import { Pin, X } from "lucide-react";
import { ACCENT, ACCENT_SOFT, BORDER, MUTED, SHADOW_SOFT, SLATE, SURFACE, SURFACE_SOFT, TEXT } from "../../styles/theme";
import usePinnedModules from "../../hooks/usePinnedModules";

/**
 * "Acceso rápido" card.
 *
 * If `actions` are provided, renders those buttons (legacy behavior).
 * If no actions, renders pinned modules from localStorage with remove option.
 * Pass `children` for fully custom layout.
 */
export default function QuickCard({ label = "Acceso rápido", actions, children, moduleKey = "global", style }) {
  const nav = useNavigate();
  const { pinned, removePin } = usePinnedModules(moduleKey);

  // If explicit actions are passed, use legacy mode
  if (actions && actions.length > 0) {
    return (
      <div style={{ ...card, ...style }}>
        {label ? <div style={labelStyle}>{label}</div> : null}
        {children ?? (
          <div style={btns}>
            {actions.map((a, i) => (
              <button
                key={a.key ?? i}
                type="button"
                onClick={a.onClick}
                style={{
                  ...quickBtn,
                  ...(a.accent ? quickBtnAccent : {}),
                  ...(a.style || {}),
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Pinned modules mode
  return (
    <div style={{ ...card, ...style }}>
      {label ? <div style={labelStyle}>{label}</div> : null}
      {children ?? (
        <div style={btns}>
          {pinned.length === 0 ? (
            <div style={emptyState}>
              <Pin size={14} strokeWidth={2} color={MUTED} />
              <span>Fijá módulos con el ícono de pin</span>
            </div>
          ) : (
            pinned.map((p) => (
              <div key={p.path} style={pinnedRow}>
                <button
                  type="button"
                  onClick={() => nav(p.path)}
                  style={quickBtnAccent}
                >
                  {p.label}
                </button>
                <button
                  type="button"
                  onClick={() => removePin(p.path)}
                  style={removeBtn}
                  title="Quitar de acceso rápido"
                  aria-label="Quitar pin"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const card = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: "14px 16px",
  boxShadow: SHADOW_SOFT,
  display: "grid",
  gap: 10,
};
const labelStyle = { fontWeight: 900, fontSize: 13, color: TEXT };
const btns = { display: "grid", gap: 8 };
const quickBtn = {
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: SURFACE_SOFT,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: TEXT,
  textAlign: "left",
  fontFamily: "inherit",
};
const quickBtnAccent = {
  borderRadius: 12,
  border: "1px solid rgba(8,159,138,0.35)",
  background: ACCENT_SOFT,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: TEXT,
  textAlign: "left",
  fontFamily: "inherit",
  flex: 1,
};
const pinnedRow = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const removeBtn = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: MUTED,
  flexShrink: 0,
  padding: 0,
  fontFamily: "inherit",
  transition: "color 150ms ease",
};
const emptyState = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 0",
  fontSize: 12,
  fontWeight: 600,
  color: SLATE,
};
