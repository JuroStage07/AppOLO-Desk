import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  SHADOW_CARD,
  SLATE,
  TEXT,
} from "../../styles/theme";

/**
 * Error state for data that failed to load, with an optional retry action.
 *
 *   <ErrorState
 *     description={loadError}
 *     onRetry={reload}
 *   />
 */
export default function ErrorState({
  title = "No se pudo cargar la información",
  description,
  onRetry,
  retryLabel = "Reintentar",
  style,
}) {
  return (
    <div style={{ ...wrap, ...style }} role="alert">
      <div style={iconBox}>
        <AlertTriangle size={22} strokeWidth={2.2} color={DANGER} />
      </div>
      <div style={titleStyle}>{title}</div>
      {description ? <div style={text}>{description}</div> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} style={retryBtn}>
          <RefreshCw size={15} strokeWidth={2.3} />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

const wrap = {
  padding: "28px 20px",
  borderRadius: 16,
  border: `1px solid ${DANGER_BORDER}`,
  background: DANGER_BG,
  boxShadow: SHADOW_CARD,
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 8,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const iconBox = {
  width: 52,
  height: 52,
  borderRadius: 16,
  background: "#fff",
  border: `1px solid ${DANGER_BORDER}`,
  display: "grid",
  placeItems: "center",
  marginBottom: 2,
};
const titleStyle = { color: TEXT, fontWeight: 900, fontSize: 15, lineHeight: 1.25 };
const text = {
  color: SLATE,
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: 420,
  wordBreak: "break-word",
};
const retryBtn = {
  marginTop: 8,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 16px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT,
  fontWeight: 850,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
