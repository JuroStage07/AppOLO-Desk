import React from "react";

/**
 * Responsive grid for <ModuleCard/> tiles.
 *
 *   <ModuleGrid>
 *     {modules.map(m => <ModuleCard key={m.key} {...m} />)}
 *   </ModuleGrid>
 */
export default function ModuleGrid({ children, min = 250, gap = 14, style }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
