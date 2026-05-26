import React, { useEffect } from "react";
import { BG, TEXT, FONT_STACK } from "../../styles/theme";

/**
 * Full-viewport page shell with sticky topbar + scrollable main.
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

  return <div style={{ ...baseShell, ...(lockBodyScroll ? lockedShell : {}), ...style }}>{children}</div>;
}

const baseShell = {
  minHeight: "100vh",
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  background: BG,
  fontFamily: FONT_STACK,
  color: TEXT,
  display: "grid",
  gridTemplateRows: "auto 1fr",
};

const lockedShell = {
  height: "100vh",
  overflow: "hidden",
};
