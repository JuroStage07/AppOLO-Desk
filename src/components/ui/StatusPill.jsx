import React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
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

/* Default icon per semantic tone so status is never conveyed by color alone
   (WCAG 1.4.1). An explicit `icon` prop overrides; pass `icon={null}` to hide. */
const TONE_ICON = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: XCircle,
};

/**
 * Status indicator pill. Tones: ok | warn | danger | neutral | accent | dark.
 *
 *   <StatusPill tone="ok">Completa</StatusPill>
 *   <StatusPill tone="warn">En proceso</StatusPill>
 *
 * ok/warn/danger render a default icon + text (color is not the only cue).
 * Pass `icon={SomeIcon}` to override or `icon={null}` to suppress.
 */
export default function StatusPill({ tone = "neutral", icon, children, style }) {
  const t = tones[tone] || tones.neutral;
  const Icon = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span style={{ ...base, ...t, ...style }} role="status">
      {Icon ? <Icon size={12} strokeWidth={2.5} style={{ marginRight: 4, flexShrink: 0 }} /> : null}
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
