import React from "react";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  ACCENT_BORDER,
  BORDER,
  SHADOW_BTN,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../styles/theme";

/**
 * Polymorphic button with three variants: `primary` (accent fill),
 * `secondary` (inset), `ghost` (white card-like).
 *
 *   <Button variant="primary" icon={Save}>Guardar</Button>
 *   <Button variant="ghost" icon={ArrowLeft}>Volver</Button>
 *
 * Pass `iconRight` to render the icon on the right side.
 */
export default function Button({
  variant = "primary",
  icon: Icon,
  iconRight = false,
  size = "md",
  block = false,
  loading = false,
  disabled,
  children,
  style,
  type = "button",
  ...rest
}) {
  const v =
    variant === "primary" ? primary : variant === "secondary" ? secondary : ghost;
  const s = size === "sm" ? sizes.sm : size === "lg" ? sizes.lg : sizes.md;
  const EffectiveIcon = loading ? Loader2 : Icon;
  const iconNode = EffectiveIcon ? (
    <EffectiveIcon
      size={16}
      strokeWidth={2.2}
      style={loading ? { animation: "spin 0.9s linear infinite" } : undefined}
    />
  ) : null;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      style={{
        ...base,
        ...v,
        ...s,
        ...(block ? { width: "100%" } : {}),
        ...(disabled || loading ? disabledStyle : {}),
        ...style,
      }}
      {...rest}
    >
      <span style={inlineIcon}>
        {!iconRight ? iconNode : null}
        {children}
        {iconRight ? iconNode : null}
      </span>
    </button>
  );
}

/** Convenience helpers — same component, fixed variant. */
export const GhostButton = (props) => <Button variant="ghost" {...props} />;
export const PrimaryButton = (props) => <Button variant="primary" {...props} />;
export const SecondaryButton = (props) => <Button variant="secondary" {...props} />;

const base = {
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 850,
  whiteSpace: "nowrap",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${BORDER}`,
  transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
};

const sizes = {
  sm: { padding: "7px 11px", fontSize: 12 },
  md: { padding: "9px 14px", fontSize: 13 },
  lg: { padding: "12px 16px", fontSize: 14, borderRadius: 14 },
};

const primary = {
  border: `1px solid ${ACCENT_BORDER}`,
  background: ACCENT,
  color: "#fff",
  boxShadow: "0 8px 22px rgba(8,159,138,0.20)",
};

const secondary = {
  background: SURFACE_INSET,
  color: TEXT,
  fontWeight: 950,
};

const ghost = {
  background: SURFACE,
  color: TEXT,
  fontWeight: 800,
  boxShadow: SHADOW_BTN,
};

const disabledStyle = { opacity: 0.6, cursor: "not-allowed" };

const inlineIcon = { display: "inline-flex", alignItems: "center", gap: 8 };
