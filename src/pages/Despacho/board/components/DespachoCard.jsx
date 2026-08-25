// Feature: despachos-dev — tarjeta de despacho del Listado.
//
// Reutiliza el `Card` del UI kit (hoverable, `onClick` para abrir el Detalle).
// Muestra `referencia`, `tienda`, `fecha`, tarimas en formato "S/D", la insignia
// de estado (`EstadoBadge`, color + texto), el nombre del chofer cuando el
// despacho tiene `chofer_id` asignado y `updated_at` como tiempo relativo.
//
// Ningún campo se deja en blanco: los textos de negocio pasan por `orNoValue` y
// las tarimas por `formatSD`, que siempre producen un texto visible no vacío.
// Colores y espaciados provienen exclusivamente de los tokens del tema (sin
// literales embebidos).
//
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

import React from "react";
import { Card, theme } from "../../../../components/ui";
import EstadoBadge from "./EstadoBadge.jsx";
import { orNoValue, formatSD, relativeTime } from "../lib/despachoFormat.js";

/**
 * Tarjeta de un despacho dentro del Listado.
 *
 * @param {object} props
 * @param {object} props.despacho - Registro de despacho (referencia, tienda,
 *   fecha, tarimas_s, tarimas_d, estado, chofer_id, updated_at, …).
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:Function,color:Function,icon:Function}} [props.mapaEstados] - Mapa prearmado.
 * @param {string|null} [props.choferNombre] - Nombre del chofer (si `chofer_id`).
 * @param {Date|number|string} [props.now] - Instante de referencia para el tiempo relativo.
 * @param {Function} [props.onClick] - Handler para abrir el Detalle.
 */
export default function DespachoCard({
  despacho,
  catalogo,
  mapaEstados,
  choferNombre,
  now,
  onClick,
}) {
  const {
    referencia,
    tienda,
    fecha,
    tarimas_s: tarimasS,
    tarimas_d: tarimasD,
    estado,
    chofer_id: choferId,
    updated_at: updatedAt,
  } = despacho ?? {};

  const tieneChofer =
    choferId !== null && choferId !== undefined && String(choferId).trim() !== "";

  // Instante de referencia para el tiempo relativo. Se prefiere el `now`
  // provisto por la página (que puede "tickear"); si no se recibe, se fija una
  // sola vez al montar para mantener el render puro y determinista.
  const [fallbackNow] = React.useState(() => Date.now());
  const effectiveNow = now ?? fallbackNow;

  return (
    <Card hoverable onClick={onClick} padding={theme.SPACE_4} style={styles.card}>
      <div style={styles.header}>
        <span style={styles.referencia}>{orNoValue(referencia)}</span>
        <EstadoBadge codigo={estado} catalogo={catalogo} mapaEstados={mapaEstados} />
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Tienda</span>
        <span style={styles.value}>{orNoValue(tienda)}</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Fecha</span>
        <span style={styles.value}>{orNoValue(fecha)}</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Tarimas (S/D)</span>
        <span style={styles.value}>{formatSD(tarimasS, tarimasD)}</span>
      </div>

      {tieneChofer && (
        <div style={styles.row}>
          <span style={styles.label}>Chofer</span>
          <span style={styles.value}>{orNoValue(choferNombre)}</span>
        </div>
      )}

      <div style={styles.footer}>
        <span style={styles.updated}>
          Actualizado {relativeTime(updatedAt, effectiveNow)}
        </span>
      </div>
    </Card>
  );
}

const styles = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: theme.SPACE_2,
    // Dentro de una columna con scroll, la tarjeta conserva su alto natural y
    // nunca se comprime (evita que el contenido se recorte/encime).
    flexShrink: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_2,
    marginBottom: theme.SPACE_1,
  },
  referencia: {
    fontSize: theme.FS_LG,
    fontWeight: theme.FW_SEMIBOLD,
    color: theme.TEXT,
    lineHeight: theme.LH_SNUG,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    fontSize: theme.FS_SM,
  },
  label: {
    color: theme.MUTED,
    fontWeight: theme.FW_MEDIUM,
  },
  value: {
    color: theme.TEXT,
    fontWeight: theme.FW_MEDIUM,
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footer: {
    marginTop: theme.SPACE_1,
  },
  updated: {
    fontSize: theme.FS_XS,
    color: theme.MUTED,
  },
};
