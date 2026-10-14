import React from "react";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { ACCENT, BORDER, DANGER, SLATE, SURFACE, TEXT } from "../styles/theme";
import { ALL_PERIODS, CURRENT_PERIOD } from "../utils/overtimeCutoffs";

/**
 * Filtro por corte: lista desplegable con el rango de fechas de cada corte y
 * un interruptor para ver solo lo atrasado (de cortes ya cerrados).
 */
export default function OvertimeCutoffFilter({
  periods,
  value,
  onChange,
  onlyLate,
  onOnlyLateChange,
  lateCount = 0,
  lateLabel = "Solo atrasadas",
}) {
  if (!periods?.length) return null;

  return (
    <div style={styles.wrap}>
      <label style={styles.field}>
        <span style={styles.label}>
          <CalendarRange size={14} strokeWidth={2.2} />
          Corte
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.select}>
          <option value={CURRENT_PERIOD}>Corte actual · {periods[0].label}</option>
          {periods.slice(1).map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value={ALL_PERIODS}>
            Todos los cortes · desde {periods[periods.length - 1].label.split(" – ")[0]}
          </option>
        </select>
      </label>

      {onOnlyLateChange && (
        <label style={{ ...styles.toggle, ...(onlyLate ? styles.toggleOn : null) }}>
          <input
            type="checkbox"
            checked={!!onlyLate}
            onChange={(e) => onOnlyLateChange(e.target.checked)}
          />
          <AlertTriangle size={14} strokeWidth={2.3} />
          {lateLabel}
          <span style={{ ...styles.count, ...(lateCount > 0 ? styles.countLate : null) }}>
            {lateCount}
          </span>
        </label>
      )}
    </div>
  );
}

/** Etiqueta del corte de un registro, con aviso de "Atrasada" cuando corresponde. */
export function CutoffTag({ period, late, lateText = "Atrasada" }) {
  if (!period) return null;
  return (
    <span style={styles.tagWrap}>
      <span style={styles.tag}>
        <CalendarRange size={12} strokeWidth={2.2} />
        Corte {period.label}
      </span>
      {late && (
        <span style={styles.lateTag}>
          <AlertTriangle size={12} strokeWidth={2.4} />
          {lateText}
        </span>
      )}
    </span>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  field: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: SLATE,
    fontSize: 12.5,
    fontWeight: 900,
  },
  select: {
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 240,
    maxWidth: "100%",
  },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: SLATE,
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12.5,
    fontWeight: 850,
    cursor: "pointer",
    userSelect: "none",
  },
  toggleOn: {
    borderColor: "rgba(220,38,38,0.35)",
    color: DANGER,
    background: "rgba(220,38,38,0.06)",
  },
  count: {
    background: "rgba(15,23,42,0.08)",
    color: SLATE,
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 11,
    fontWeight: 900,
  },
  countLate: { background: DANGER, color: "#fff" },
  tagWrap: { display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: ACCENT,
    background: "rgba(8,159,138,0.08)",
    border: "1px solid rgba(8,159,138,0.22)",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11.5,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  lateTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "#fff",
    background: DANGER,
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
};
