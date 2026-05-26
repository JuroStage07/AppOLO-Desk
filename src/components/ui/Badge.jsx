import React from "react";
import { ACCENT, ACCENT_SOFT, BORDER } from "../../styles/theme";

/**
 * Soft pill-shaped label. Three visual tones: neutral (default), accent, dark.
 *
 *   <Badge>Módulo</Badge>
 *   <Badge tone="accent" icon={Package}>Operación</Badge>
 *   <Badge tone="dark">Beta</Badge>
 */
export default function Badge({
  children,
  tone = "neutral",
  icon: Icon,
  iconSize = 12,
  style,
}) {
  const toneStyle =
    tone === "accent" ? accentTone : tone === "dark" ? darkTone : neutralTone;

  return (
    <span style={{ ...base, ...toneStyle, ...style }}>
      {Icon ? <Icon size={iconSize} strokeWidth={2.5} style={{ marginRight: 5 }} /> : null}
      {children}
    </span>
  );
}

const base = {
  fontSize: 12,
  fontWeight: 800,
  padding: "5px 11px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
};

const neutralTone = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  color: "#334155",
};

const accentTone = {
  background: ACCENT_SOFT,
  border: "1px solid rgba(8,159,138,0.30)",
  color: ACCENT,
};

const darkTone = {
  background: "#0F172A",
  border: "1px solid #0F172A",
  color: "#fff",
};
