import React, { useEffect } from "react";
import { BG, TEXT, FONT_STACK } from "../../styles/theme";

/**
 * Full-viewport page shell: topbar stays fixed, only <Main/> scrolls.
 *
 * Props:
 *  - children: <Topbar/> + <Main/> typically
 *  - lockBodyScroll: when true (default), freezes body scroll while the page is mounted (matches Recepción home).
 *  - style: optional style override
 */
export default function Shell({ children, lockBodyScroll = true, style }) {
  useEffect(() => {
    if (!lockBodyScroll) return;
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = BG;
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, [lockBodyScroll]);

  return (
    <div style={{ ...shellLayoutStyle, ...style }}>{children}</div>
  );
}

/** Root layout for pages that compose Topbar + scrollable main without <Shell>. */
export const shellLayoutStyle = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  background: BG,
  fontFamily: FONT_STACK,
  color: TEXT,
  display: "grid",
  gridTemplateRows: "auto 1fr",
  minHeight: "100vh",
  height: "100dvh",
  overflow: "hidden",
};

/** Scrollable body row — pair with shellLayoutStyle. */
export const mainScrollStyle = {
  width: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
};
