import React from "react";
import { BORDER, SHADOW_SOFT, TEXT } from "../../styles/theme";

/**
 * "Acceso rápido" card with a stack of quick-action buttons.
 *
 *   <QuickCard label="Acceso rápido"
 *     actions={[
 *       { label: "Acciones de descarga", accent: true, onClick: ... },
 *       { label: "Estadísticas", accent: true, onClick: ... },
 *     ]} />
 *
 * Or pass `children` directly when you need a custom layout.
 */
export default function QuickCard({ label = "Acceso rápido", actions, children, style }) {
  return (
    <div style={{ ...card, ...style }}>
      {label ? <div style={labelStyle}>{label}</div> : null}
      {children ?? (
        <div style={btns}>
          {(actions || []).map((a, i) => (
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

const card = {
  background: "#fff",
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
  background: "#FBFCFF",
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: TEXT,
  textAlign: "left",
  fontFamily: "inherit",
};
const quickBtnAccent = { borderColor: "rgba(8,159,138,0.35)", background: "#F3FBF9" };
