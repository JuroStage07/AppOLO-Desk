import React from "react";
import { BORDER, RADIUS_LG } from "../../styles/theme";

/**
 * Responsive wrapper for wide tables. On narrow screens the table scrolls
 * horizontally instead of overflowing the page, with subtle edge fades and a
 * rounded border. Wrap any <table> (or wide block) with it:
 *
 *   <TableScroll>
 *     <table>…</table>
 *   </TableScroll>
 *
 * Set `minWidth` to the smallest width the content needs before it should start
 * scrolling (default 640).
 */
export default function TableScroll({ children, minWidth = 640, bordered = true, style }) {
  return (
    <div style={{ ...outer, ...(bordered ? borderedOuter : {}), ...style }}>
      <div style={scroller} role="region" tabIndex={0} aria-label="Tabla con desplazamiento horizontal">
        <div style={{ minWidth }}>{children}</div>
      </div>
    </div>
  );
}

const outer = {
  position: "relative",
  width: "100%",
  borderRadius: RADIUS_LG,
  overflow: "hidden",
};
const borderedOuter = {
  border: `1px solid ${BORDER}`,
  background: "var(--c-surface, #fff)",
};
const scroller = {
  width: "100%",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};
