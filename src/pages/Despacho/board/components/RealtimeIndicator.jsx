// Feature: despachos-dev — indicador no bloqueante de realtime inactivo.
//
// Informa que la actualización automática (Supabase Realtime) está inactiva sin
// bloquear el uso del listado ni del detalle: es un chip pequeño, informativo y
// pasivo (sin controles que interrumpan). Cuando la conexión se restablece, el
// contenedor deja de renderizar el indicador (retorna `null`), de modo que
// desaparece al reconectar.
//
// _Requirements: 7.6, 7.7_

import React from "react";
import { WifiOff } from "lucide-react";
import { theme } from "../../../../components/ui";

/**
 * Indicador no bloqueante del estado de la conexión realtime.
 *
 * Sólo renderiza contenido cuando `status === "inactivo"`. Para cualquier otro
 * valor (incluido `"activo"` o indefinido) retorna `null`, garantizando que el
 * indicador se retire tras una reconexión exitosa (Requirement 7.7).
 *
 * @param {object} props
 * @param {"activo"|"inactivo"} [props.status] - Estado de la suscripción realtime.
 */
export default function RealtimeIndicator({ status }) {
  // Se retira en cualquier estado distinto de "inactivo" (p. ej. tras reconectar).
  if (status !== "inactivo") return null;

  return (
    <div style={wrapStyle} role="status" aria-live="polite">
      <WifiOff size={16} strokeWidth={2.2} aria-hidden="true" style={iconStyle} />
      <span style={textStyle}>
        Actualización automática inactiva. Reintentando…
      </span>
    </div>
  );
}

// Chip pequeño, no modal, que fluye con el contenido (no bloquea la vista).
// Colores/espaciado sólo desde tokens del tema (Requirement 11.4).
const wrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: theme.SPACE_2,
  padding: `${theme.SPACE_1}px ${theme.SPACE_3}px`,
  borderRadius: theme.RADIUS_PILL,
  background: theme.WARN_BG,
  border: `1px solid ${theme.WARN_BORDER}`,
  color: theme.SLATE_DEEP,
  fontSize: theme.FS_SM,
  fontWeight: theme.FW_MEDIUM,
  lineHeight: theme.LH_SNUG,
  maxWidth: "100%",
};

const iconStyle = {
  flexShrink: 0,
  color: theme.SLATE_DEEP,
};

const textStyle = {
  whiteSpace: "normal",
};
