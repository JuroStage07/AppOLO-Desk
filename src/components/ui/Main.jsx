import React from "react";
import { CONTAINER_MAX } from "../../styles/theme";

/**
 * Scrollable page body. Wrap content with <Container/> for the centered max-width column.
 *
 *   <Main>
 *     <Container>
 *       ...
 *     </Container>
 *   </Main>
 */
export function Main({ children, style, padding = "18px 16px 28px", center = false }) {
  return (
    <main style={{ ...main, padding, ...(center ? mainCenter : {}), ...style }}>{children}</main>
  );
}

export function Container({ children, style, gap = 16, max = CONTAINER_MAX }) {
  return (
    <div style={{ ...container, gap, maxWidth: max, ...style }}>{children}</div>
  );
}

const main = {
  width: "100%",
  boxSizing: "border-box",
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
};

const mainCenter = {
  display: "grid",
  placeItems: "start center",
};

const container = {
  width: "100%",
  marginLeft: "auto",
  marginRight: "auto",
  boxSizing: "border-box",
  display: "grid",
};

export default Main;
