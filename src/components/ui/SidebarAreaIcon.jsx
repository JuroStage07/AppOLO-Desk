import React from "react";
import { BORDER_SOFT, SLATE } from "../../styles/theme";

/**
 * 32×32 tile for sidebar area rows — PNG app icon or Lucide fallback.
 */
export default function SidebarAreaIcon({ img, fallback, style }) {
  return (
    <div style={{ ...box, ...style }}>
      {img ? (
        <img src={img} alt="" style={imgStyle} draggable={false} />
      ) : (
        fallback
      )}
    </div>
  );
}

const box = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "var(--c-surface-inset, #F1F5F9)",
  border: `1px solid ${BORDER_SOFT}`,
  color: SLATE,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  overflow: "hidden",
};

const imgStyle = {
  width: 24,
  height: 24,
  objectFit: "contain",
  display: "block",
};
