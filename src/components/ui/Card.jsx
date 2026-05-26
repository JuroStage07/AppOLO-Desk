import React, { useState } from "react";
import {
  BORDER,
  RADIUS_XL,
  SHADOW_CARD,
  SHADOW_CARD_HOVER,
  SURFACE,
} from "../../styles/theme";

/**
 * Generic surface card.
 *
 *   <Card>...</Card>
 *   <Card tone="accent" hoverable onClick={...}>...</Card>
 *
 * Props:
 *  - tone: "neutral" (default) | "accent"
 *  - hoverable: lift on hover and focus
 *  - padding: shortcut for inner padding (number or string)
 */
export default function Card({
  children,
  tone = "neutral",
  hoverable = false,
  padding,
  onClick,
  onKeyDown,
  style,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const interactive = typeof onClick === "function" || hoverable;

  const handleKey = (e) => {
    if (onKeyDown) onKeyDown(e);
    if (typeof onClick === "function" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <div
      role={typeof onClick === "function" ? "button" : undefined}
      tabIndex={typeof onClick === "function" ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKey}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      onFocus={() => interactive && setHover(true)}
      onBlur={() => interactive && setHover(false)}
      style={{
        ...base,
        ...(tone === "accent" ? accent : {}),
        ...(padding != null ? { padding } : {}),
        ...(hover ? hoverStyle : {}),
        ...(typeof onClick === "function" ? { cursor: "pointer", userSelect: "none" } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

const base = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_XL,
  overflow: "hidden",
  transition: "transform 120ms ease, box-shadow 120ms ease",
  boxShadow: SHADOW_CARD,
};

const accent = {
  borderColor: "rgba(8,159,138,0.35)",
  boxShadow: "0 12px 26px rgba(8, 159, 138, 0.10)",
};

const hoverStyle = {
  transform: "translateY(-2px)",
  boxShadow: SHADOW_CARD_HOVER,
};
