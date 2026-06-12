import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { resolveTrail } from "./routeTrail";
import { SLATE, TEXT } from "../../styles/theme";

/**
 * Route-aware breadcrumb trail (Inicio › Área › Sección › Detalle).
 *
 * Rendered by <Topbar/> inside its slim utility sub-bar, so every page gets
 * consistent "where am I" navigation with clickable parents. Trail resolution
 * lives in ./routeTrail. Renders nothing when there is no hierarchy to show.
 */

export default function Breadcrumbs() {
  const location = useLocation();
  const nav = useNavigate();
  const trail = useMemo(
    () => resolveTrail(location.pathname),
    [location.pathname]
  );

  if (trail.length < 2) return null;

  return (
    <nav style={navStyle} aria-label="Ruta de navegación">
      <ol style={list}>
        {trail.map((item, idx) => {
          const isLast = idx === trail.length - 1;
          return (
            <li key={item.path + idx} style={li}>
              {idx > 0 && (
                <ChevronRight
                  size={13}
                  strokeWidth={2.4}
                  style={{ color: "#CBD5E1", flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span style={current} aria-current="page">
                  {item.home ? <Home size={13} strokeWidth={2.4} /> : null}
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => nav(item.path)}
                  style={crumbBtn}
                >
                  {item.home ? <Home size={13} strokeWidth={2.4} /> : null}
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const navStyle = { minWidth: 0, flex: 1 };
const list = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const li = { display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 };
const crumbBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "none",
  background: "transparent",
  padding: "2px 4px",
  borderRadius: 7,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 750,
  color: SLATE,
  lineHeight: 1.2,
  transition: "color 120ms ease",
};
const current = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "2px 4px",
  fontSize: 12,
  fontWeight: 850,
  color: TEXT,
  lineHeight: 1.2,
  maxWidth: "55vw",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
