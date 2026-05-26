import React from "react";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  OK_BG,
  OK_BORDER,
  WARN_BG,
  WARN_BORDER,
} from "../../styles/theme";

/**
 * Status indicator pill. Tones: ok | warn | danger | neutral | accent | dark.
 *
 *   <StatusPill tone="ok">Completa</StatusPill>
 *   <StatusPill tone="warn">En proceso</StatusPill>
 */
export default function StatusPill({ tone = "neutral", icon: Icon, children, style }) {
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ ...base, ...t, ...style }}>
      {Icon ? <Icon size={12} strokeWidth={2.5} style={{ marginRight: 4 }} /> : null}
      {children}
    </span>
  );
}

const base = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  fontWeight: 800,
  fontSize: 11,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
};

const tones = {
  neutral: { background: "#F2F4FB", color: "#334155" },
  ok: { background: OK_BG, borderColor: OK_BORDER, color: "#1B7A3A" },
  warn: { background: WARN_BG, borderColor: WARN_BORDER, color: "#8C5A00" },
  danger: { background: DANGER_BG, borderColor: DANGER_BORDER, color: DANGER },
  accent: { background: ACCENT_SOFT, borderColor: "rgba(8,159,138,0.30)", color: ACCENT },
  dark: { background: "#0F172A", borderColor: "#0F172A", color: "#fff" },
};
