import React from "react";
import { CalendarClock, CalendarCheck, AlertTriangle } from "lucide-react";
import { BORDER, SLATE, TEXT } from "../styles/theme";
import { fmtCutoffDate, fmtCutoffLong } from "../hooks/useOvertimeCutoff";

/**
 * Tonos del aviso según los días restantes para el corte:
 * - verde: hay holgura (> 10 días)
 * - amarillo: en tiempo, atención (4 – 10 días)
 * - rojo: urgente (≤ 3 días)
 */
const TONES = {
  green: {
    color: "#0F766E",
    wrap: { background: "rgba(8,159,138,0.08)", border: "1px solid rgba(8,159,138,0.28)" },
    iconBg: "rgba(8,159,138,0.14)",
    pillBg: "#0F766E",
    Icon: CalendarCheck,
  },
  yellow: {
    color: "#B45309",
    wrap: { background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.34)" },
    iconBg: "rgba(245,158,11,0.18)",
    pillBg: "#B45309",
    Icon: CalendarClock,
  },
  red: {
    color: "#DC2626",
    wrap: { background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.32)" },
    iconBg: "rgba(220,38,38,0.16)",
    pillBg: "#DC2626",
    Icon: AlertTriangle,
  },
};

function toneFor(days) {
  if (days <= 3) return TONES.red;
  if (days <= 10) return TONES.yellow;
  return TONES.green;
}

/**
 * Banner informativo con la próxima fecha de corte de horas extra.
 * Recuerda a coordinadores y gerentes que deben aprobar/rechazar antes del corte.
 */
export default function OvertimeCutoffBanner({ next, loading }) {
  if (loading) return null;

  // Sin configuración de corte: aviso suave para que la definan.
  if (!next) {
    return (
      <div style={{ ...styles.wrap, ...styles.wrapMuted }}>
        <span style={{ ...styles.icon, background: "#EEF2F7", color: SLATE }}>
          <CalendarClock size={18} strokeWidth={2.2} />
        </span>
        <span style={styles.textMuted}>
          No hay una fecha de corte configurada. Definila en la configuración del módulo de horas extra.
        </span>
      </div>
    );
  }

  const days = next.daysRemaining;
  const tone = toneFor(days);
  const { Icon } = tone;

  const daysLabel =
    days <= 0
      ? "Hoy es el último día de corte"
      : `Faltan ${days} día${days === 1 ? "" : "s"} para el corte`;

  return (
    <div style={{ ...styles.wrap, ...tone.wrap }}>
      <span style={{ ...styles.icon, background: tone.iconBg, color: tone.color }}>
        <Icon size={18} strokeWidth={2.3} />
      </span>
      <div style={styles.body}>
        <div style={styles.title}>
          Próximo corte:{" "}
          <strong style={{ color: tone.color, fontWeight: 950 }}>
            {fmtCutoffDate(next.date)}
          </strong>{" "}
          <span style={styles.long}>({fmtCutoffLong(next.date)})</span>
        </div>
        <div style={styles.note}>
          {daysLabel}. Aprobá o rechazá las horas extra antes de esta fecha.
        </div>
      </div>
      <span style={{ ...styles.pill, background: tone.pillBg }}>
        {days <= 0 ? "Hoy" : `${days} d`}
      </span>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: "14px 16px",
    transition: "background 0.2s ease, border-color 0.2s ease",
  },
  wrapMuted: {
    background: "#F8FAFC",
    border: `1px dashed ${BORDER}`,
  },
  icon: {
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    borderRadius: 12,
    flexShrink: 0,
  },
  body: { display: "grid", gap: 3, minWidth: 0, flex: 1 },
  title: { fontSize: 14, fontWeight: 800, color: TEXT, lineHeight: 1.3 },
  long: { color: SLATE, fontWeight: 700, fontSize: 13 },
  note: { fontSize: 12.5, fontWeight: 700, color: SLATE, lineHeight: 1.35 },
  textMuted: { fontSize: 13, fontWeight: 700, color: SLATE, lineHeight: 1.35 },
  pill: {
    flexShrink: 0,
    borderRadius: 999,
    padding: "6px 12px",
    color: "#fff",
    fontSize: 13,
    fontWeight: 950,
  },
};
