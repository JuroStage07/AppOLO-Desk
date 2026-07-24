import React from "react";
import { ACCENT, BORDER, SLATE, TEXT } from "../../styles/theme";

/**
 * KPI tile used in metric dashboards.
 *
 *   <KpiCard label="Acciones" value={42} hint="Última semana" icon={BarChart3} />
 *
 * Use <KpiGrid/> to lay out multiple cards.
 */
export default function KpiCard({ label, value, hint, icon: Icon, accent = false, style }) {
  return (
    <div style={{ ...card, ...(accent ? cardAccent : {}), ...style }}>
      <div style={topRow}>
        <span style={labelStyle}>{label}</span>
        {Icon ? (
          <span style={{ ...iconWrap, ...(accent ? iconWrapAccent : {}) }}>
            <Icon size={16} strokeWidth={2.2} color={accent ? ACCENT : SLATE} />
          </span>
        ) : null}
      </div>
      <div style={valueStyle}>{value}</div>
      {hint ? <div style={hintStyle}>{hint}</div> : null}
    </div>
  );
}

export function KpiGrid({ children, min = 200, gap = 12, style }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const card = {
  background: "linear-gradient(180deg, var(--c-surface, #FFFFFF) 0%, var(--c-surface-soft, #FCFDFE) 100%)",
  border: `1px solid ${BORDER}`,
  borderRadius: 22,
  padding: 16,
  boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
  minHeight: 124,
  display: "grid",
  alignContent: "start",
  gap: 8,
};
const cardAccent = {
  border: "1px solid rgba(8,159,138,0.35)",
  boxShadow: "0 10px 22px rgba(8,159,138,0.10)",
};
const topRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const labelStyle = { color: SLATE, fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 };
const iconWrap = {
  width: 28,
  height: 28,
  borderRadius: 10,
  background: "var(--c-surface-inset, #F1F5F9)",
  border: `1px solid ${BORDER}`,
  display: "grid",
  placeItems: "center",
};
const iconWrapAccent = { background: "rgba(8,159,138,0.12)", border: "1px solid rgba(8,159,138,0.25)" };
const valueStyle = { fontWeight: 950, fontSize: 26, color: TEXT, lineHeight: 1.1 };
const hintStyle = { color: SLATE, fontWeight: 800, fontSize: 12 };
