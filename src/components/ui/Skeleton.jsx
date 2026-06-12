import React from "react";
import { RADIUS_MD } from "../../styles/theme";

/**
 * Shimmer skeleton placeholder for loading states. Prefer this over a bare
 * spinner for lists/cards — it preserves layout and feels faster.
 *
 *   <Skeleton height={56} />                      // single bar
 *   <Skeleton.List rows={5} />                    // stacked rows
 *   <Skeleton.Cards count={6} />                  // responsive card grid
 */
export default function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, #EEF1F6 25%, #F6F8FB 37%, #EEF1F6 63%)",
        backgroundSize: "400% 100%",
        animation: "appoloShimmer 1.3s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function SkeletonList({ rows = 4, height = 56, gap = 10, style }) {
  return (
    <div style={{ display: "grid", gap, ...style }} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} radius={RADIUS_MD} />
      ))}
    </div>
  );
}

function SkeletonCards({ count = 6, minWidth = 220, height = 150, style }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minWidth}px), 1fr))`,
        gap: 16,
        ...style,
      }}
      aria-busy="true"
      aria-label="Cargando"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} radius={16} />
      ))}
    </div>
  );
}

Skeleton.List = SkeletonList;
Skeleton.Cards = SkeletonCards;
