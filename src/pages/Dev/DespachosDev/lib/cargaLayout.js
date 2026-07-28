// Feature: despachos-dev — capa de dominio pura del grid de carga (contenedor).
//
// La tabla `despacho_dev_layout.slots` es un array jsonb de 24 posiciones. Cada
// posición es un objeto `{ type, lotId, part }` donde `type` ∈ {E,S,D,T,C}:
//   E vacío | S simple | D doble | T triple | C cuádruple.
// Geometría: grid 12 filas × 2 columnas. Posición p (1..24) ↔ índice p-1;
// columna izquierda = impares (2i+1), derecha = pares (2i+2); fila r = (2r+1, 2r+2).
//
// Este módulo es puro y determinista (no muta entradas, sin efectos) y se valida
// por pruebas de propiedad.

export const CAPACITY = 24;

// Tipos de celda ocupada válidos (E = vacío).
const OCCUPIED_TYPES = new Set(["S", "D", "T", "C"]);

/**
 * Normaliza `slots` a exactamente 24 celdas `{ type, lotId?, part? }`.
 * Celdas ausentes o con `type` inválido se tratan como vacías (`{ type: "E" }`).
 * No muta la entrada.
 *
 * @param {Array<{type?:string, lotId?:*, part?:*}>|null|undefined} slots
 * @returns {Array<{type:string, lotId?:*, part?:*}>} exactamente 24 celdas
 */
export function normalizeSlots(slots) {
  const out = [];
  for (let i = 0; i < CAPACITY; i += 1) {
    const cell = Array.isArray(slots) ? slots[i] : null;
    const type = cell && OCCUPIED_TYPES.has(cell.type) ? cell.type : "E";
    if (type === "E") {
      out.push({ type: "E" });
    } else {
      out.push({ type, lotId: cell.lotId, part: cell.part });
    }
  }
  return out;
}

/**
 * Calcula estadísticas del grid a partir de `slots`.
 *
 * - `cells`: 24 celdas normalizadas (para renderizar el grid 12×2).
 * - `counts`: cantidad de TARIMAS (lotes distintos) por tipo S/D/T/C.
 * - `ocupado`: número de celdas ocupadas (type ≠ E).
 * - `libre`: 24 − ocupado.
 * - `capacity`: 24.
 * - `progress`: porcentaje entero de ocupación (0..100).
 *
 * El conteo por tipo agrupa por `lotId` (una tarima doble ocupa 2 celdas pero
 * cuenta como 1). Si una celda ocupada no trae `lotId`, se cuenta por su índice.
 *
 * @param {Array<{type?:string, lotId?:*, part?:*}>|null|undefined} slots
 */
export function gridStats(slots) {
  const cells = normalizeSlots(slots);
  const lotsByType = { S: new Set(), D: new Set(), T: new Set(), C: new Set() };
  let ocupado = 0;

  cells.forEach((cell, idx) => {
    if (cell.type === "E") return;
    ocupado += 1;
    const key = cell.lotId != null && cell.lotId !== "" ? `lot:${cell.lotId}` : `cell:${idx}`;
    lotsByType[cell.type].add(key);
  });

  const counts = {
    S: lotsByType.S.size,
    D: lotsByType.D.size,
    T: lotsByType.T.size,
    C: lotsByType.C.size,
  };
  const libre = CAPACITY - ocupado;
  const progress = Math.round((ocupado / CAPACITY) * 100);

  return { cells, counts, ocupado, libre, capacity: CAPACITY, progress };
}

/**
 * Divide las 24 celdas normalizadas en 12 filas de 2 columnas [izquierda, derecha]
 * junto con el número de posición 1..24 de cada celda (para etiquetar el grid).
 *
 * @param {Array<{type:string}>} cells - 24 celdas (salida de normalizeSlots).
 * @returns {Array<{ row:number, left:{pos:number, cell:object}, right:{pos:number, cell:object} }>}
 */
export function toRows(cells) {
  const rows = [];
  for (let r = 0; r < CAPACITY / 2; r += 1) {
    const li = 2 * r;
    const ri = 2 * r + 1;
    rows.push({
      row: r,
      left: { pos: li + 1, cell: cells[li] || { type: "E" } },
      right: { pos: ri + 1, cell: cells[ri] || { type: "E" } },
    });
  }
  return rows;
}
