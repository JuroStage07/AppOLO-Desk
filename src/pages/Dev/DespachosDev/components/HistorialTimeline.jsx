// Feature: despachos-dev — línea de tiempo vertical del historial de un despacho.
//
// Renderiza la bitácora inmutable (`despacho_dev_actividad`) como una línea de
// tiempo vertical con `descripcion`, `actor_email` y `created_at` (fecha y hora
// a minutos), en orden `created_at` descendente estable (desempate por `id`).
// Cuando el `detalle` de una entrada contiene ambos estados, muestra la
// transición coloreada (estadoAnterior → estadoNuevo) usando `EstadoBadge`.
//
// Estados propios: vacío ("no existen registros de actividad") y error
// ("no se pudo cargar el historial") — el error se muestra inline SIN cerrar el
// detalle (este componente sólo renderiza su propia región).
//
// _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

import React from "react";
import { ArrowRight } from "lucide-react";
import { theme, EmptyState, ErrorState } from "../../../../components/ui";
import { parseTransicion } from "../lib/historialDetalle.js";
import { sortHistorial } from "../lib/despachoGrouping.js";
import { orNoValue } from "../lib/despachoFormat.js";
import EstadoBadge from "./EstadoBadge.jsx";

// Formateador de fecha/hora a minutos en español (es-ES). Se construye una vez.
const dateTimeFormat = new Intl.DateTimeFormat("es-ES", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formatea `created_at` con fecha y hora hasta minutos. Devuelve el marcador de
 * ausencia ("—") cuando el valor no es interpretable como fecha (Requirement 6.3).
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
function formatFechaHora(value) {
  if (value === null || value === undefined || value === "") return orNoValue(value);
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) return orNoValue(value);
  return dateTimeFormat.format(new Date(ms));
}

/**
 * Devuelve una clave estable para una entrada de actividad.
 * @param {{ id?: * }} entry
 * @param {number} index
 * @returns {string}
 */
function entryKey(entry, index) {
  const id = entry?.id;
  return id !== null && id !== undefined ? String(id) : `idx-${index}`;
}

/**
 * Línea de tiempo vertical del historial de un despacho.
 *
 * @param {object} props
 * @param {Array<object>} [props.historial] - Entradas de `despacho_dev_actividad`.
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:Function,color:Function,icon:Function}} [props.mapaEstados] - Mapa de estados prearmado.
 * @param {boolean} [props.loading] - Carga en curso.
 * @param {boolean|string} [props.error] - Indicador/mensaje de error de carga.
 * @param {() => void} [props.onRetry] - Acción de reintento para el estado de error.
 */
export default function HistorialTimeline({
  historial,
  catalogo,
  mapaEstados,
  loading,
  error,
  onRetry,
}) {
  // Estado de error: inline, sin cerrar el detalle (Requirement 6.8).
  if (error) {
    return (
      <ErrorState
        title="No se pudo cargar el historial"
        description="No se pudo cargar el historial. Intentá nuevamente."
        onRetry={onRetry}
      />
    );
  }

  // Estado de carga: indicador no bloqueante.
  if (loading) {
    return <div style={loadingStyle}>Cargando historial…</div>;
  }

  const entries = sortHistorial(Array.isArray(historial) ? historial : []);

  // Estado vacío propio (Requirement 6.7).
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Sin actividad"
        description="No existen registros de actividad."
      />
    );
  }

  return (
    <ol style={listStyle}>
      {entries.map((entry, index) => {
        const transicion = parseTransicion(entry?.detalle);
        return (
          <li key={entryKey(entry, index)} style={itemStyle}>
            <span style={markerStyle} aria-hidden="true" />
            <div style={contentStyle}>
              <div style={descripcionStyle}>{orNoValue(entry?.descripcion)}</div>

              {transicion ? (
                <div style={transicionStyle}>
                  <EstadoBadge
                    codigo={transicion.estadoAnterior}
                    catalogo={catalogo}
                    mapaEstados={mapaEstados}
                  />
                  <ArrowRight size={14} strokeWidth={2.4} color={theme.SLATE} aria-hidden="true" />
                  <EstadoBadge
                    codigo={transicion.estadoNuevo}
                    catalogo={catalogo}
                    mapaEstados={mapaEstados}
                  />
                </div>
              ) : null}

              <div style={metaStyle}>
                <span>{orNoValue(entry?.actor_email)}</span>
                <span aria-hidden="true">·</span>
                <time>{formatFechaHora(entry?.created_at)}</time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.SPACE_4,
};

const itemStyle = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: theme.SPACE_3,
  paddingLeft: theme.SPACE_1,
};

const markerStyle = {
  marginTop: 6,
  width: 10,
  height: 10,
  borderRadius: theme.RADIUS_PILL,
  background: theme.ACCENT,
  border: `2px solid ${theme.SURFACE}`,
  boxShadow: `0 0 0 1px ${theme.BORDER}`,
  alignSelf: "start",
};

const contentStyle = {
  display: "grid",
  gap: theme.SPACE_2,
  borderLeft: `1px solid ${theme.BORDER}`,
  paddingLeft: theme.SPACE_4,
  paddingBottom: theme.SPACE_2,
};

const descripcionStyle = {
  color: theme.TEXT,
  fontWeight: theme.FW_SEMIBOLD,
  fontSize: theme.FS_BASE,
  lineHeight: theme.LH_SNUG,
};

const transicionStyle = {
  display: "flex",
  alignItems: "center",
  gap: theme.SPACE_2,
  flexWrap: "wrap",
};

const metaStyle = {
  display: "flex",
  alignItems: "center",
  gap: theme.SPACE_2,
  flexWrap: "wrap",
  color: theme.SLATE,
  fontSize: theme.FS_SM,
  fontWeight: theme.FW_MEDIUM,
};

const loadingStyle = {
  color: theme.SLATE,
  fontSize: theme.FS_SM,
  fontWeight: theme.FW_MEDIUM,
  padding: theme.SPACE_3,
};
