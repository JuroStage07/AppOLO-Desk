/**
 * historialDetalle.js — Capa de dominio pura para el historial de despachos.
 *
 * Detección de transición de estados en una entrada de actividad
 * (`despacho_dev_actividad.detalle`).
 *
 * Requirements: 6.5, 6.6
 * Validated by: Property 19 (detección de transición en el historial).
 */

/**
 * Determina si un valor es un string no vacío tras recortar espacios.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Extrae la transición de estados de una entrada de actividad.
 *
 * Devuelve `{ estadoAnterior, estadoNuevo }` únicamente cuando AMBOS campos
 * existen y son strings no vacíos (tras recortar espacios). En cualquier otro
 * caso (falta uno, faltan ambos, o `detalle` es nulo/indefinido/no objeto)
 * devuelve `null`. Los valores devueltos son los originales de la entrada
 * (sin recortar), preservando la fidelidad del dato registrado.
 *
 * Función pura y determinista: no muta la entrada ni depende de estado externo.
 *
 * @param {{ estadoAnterior?: unknown, estadoNuevo?: unknown } | null | undefined} detalle
 * @returns {{ estadoAnterior: string, estadoNuevo: string } | null}
 */
export function parseTransicion(detalle) {
  if (detalle === null || typeof detalle !== "object" || Array.isArray(detalle)) {
    return null;
  }

  const { estadoAnterior, estadoNuevo } = detalle;

  if (!isNonEmptyString(estadoAnterior) || !isNonEmptyString(estadoNuevo)) {
    return null;
  }

  return { estadoAnterior, estadoNuevo };
}
