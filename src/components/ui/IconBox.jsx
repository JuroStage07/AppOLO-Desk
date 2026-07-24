import React from "react";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE_INSET } from "../../styles/theme";

/**
 * Rounded square icon container used in card headers.
 *
 *   <IconBox icon={Truck} tone="accent" />
 */
export default function IconBox({
  icon: Icon,
  iconNode,
  tone = "neutral",
  size = 48,
  iconSize = 22,
  style,
}) {
  const accent = tone === "accent";
  return (
    <div
      style={{
        ...base,
        width: size,
        height: size,
        ...(accent ? accentStyle : {}),
        ...style,
      }}
    >
      {iconNode ??
        (Icon ? (
          <Icon size={iconSize} strokeWidth={2.2} color={accent ? ACCENT : SLATE} />
        ) : null)}
    </div>
  );
}

const base = {
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background: SURFACE_INSET,
  border: `1px solid ${BORDER}`,
};

const accentStyle = {
  background: ACCENT_SOFT,
  border: "1px solid rgba(8,159,138,0.25)",
};
