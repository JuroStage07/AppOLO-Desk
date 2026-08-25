// Capa de dominio pura para "Despachos Dev": reductor realtime.
//
// Aplica de forma determinista un evento `postgres_changes` de Supabase
// (INSERT/UPDATE/DELETE) sobre la lista local de despachos, actuando
// únicamente sobre el despacho afectado (por `id`) cuando pertenece al
// scope del usuario, e ignorando por completo los eventos fuera de scope.
//
// Módulo puro y determinista: no muta la lista ni los objetos recibidos.
// Se valida mediante la Property 20 del diseño de `despachos-dev`.
//
// _Requirements: 7.2, 7.3, 9.1_

import { isRowInScope } from "./scopeFilter";

/**
 * @typedef {Object} RealtimeEvent
 * @property {"INSERT"|"UPDATE"|"DELETE"} type Tipo de cambio de postgres_changes.
 * @property {object} [new] Fila resultante (INSERT/UPDATE).
 * @property {object} [old] Fila previa (UPDATE/DELETE).
 */

/**
 * Resuelve la fila afectada por el evento según su tipo.
 * Para DELETE se prioriza `old`; para INSERT/UPDATE se prioriza `new`.
 * @param {RealtimeEvent} event
 * @returns {object | null}
 */
function affectedRow(event) {
  if (event.type === "DELETE") {
    return event.old ?? event.new ?? null;
  }
  return event.new ?? event.old ?? null;
}

/**
 * Reductor realtime puro sobre la lista de despachos en scope.
 *
 * Comportamiento (Property 20):
 * - Si el evento corresponde a un despacho DENTRO del `scope`, aplica la
 *   inserción/actualización/eliminación únicamente sobre el despacho afectado
 *   (identificado por `id`), dejando el resto de la lista intacto y devolviendo
 *   un arreglo nuevo (sin mutar la entrada).
 * - Si el evento corresponde a un despacho FUERA del `scope` (o es inválido, o
 *   la fila afectada no tiene `id`), la lista permanece sin cambios y se
 *   devuelve la misma referencia recibida.
 *
 * @template {{ id?: * }} T
 * @param {readonly T[]} despachos Lista actual de despachos en scope.
 * @param {RealtimeEvent} event Evento con forma de Supabase postgres_changes.
 * @param {import("./scopeFilter").UserScope | null | undefined} scope
 * @returns {T[]} Nueva lista (cambios en scope) o la lista original (sin cambios).
 * _Requirements: 7.2, 7.3, 9.1_
 */
export function realtimeReducer(despachos, event, scope) {
  const list = Array.isArray(despachos) ? despachos : [];

  if (!event || typeof event !== "object") return list;

  const row = affectedRow(event);
  if (!row || !isRowInScope(row, scope)) return list; // fuera de scope o inválido: sin cambios

  const { id } = row;
  if (id === null || id === undefined) return list;

  switch (event.type) {
    case "INSERT":
    case "UPDATE": {
      const idx = list.findIndex((d) => d?.id === id);
      if (idx === -1) return [...list, row];
      const next = list.slice();
      next[idx] = row;
      return next;
    }
    case "DELETE":
      return list.filter((d) => d?.id !== id);
    default:
      return list;
  }
}
