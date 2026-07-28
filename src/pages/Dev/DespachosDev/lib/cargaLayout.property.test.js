// Feature: despachos-dev, Property (carga): estadísticas del grid consistentes
//
// Invariantes de la capa de dominio del grid de carga (cargaLayout):
//  - normalizeSlots siempre produce exactamente 24 celdas con tipo válido.
//  - ocupado = número de celdas no vacías = 24 - libre, y está en [0, 24].
//  - progress = round(ocupado/24*100) y está en [0, 100].
//  - el número de tarimas (lotes) por tipo nunca excede las celdas de ese tipo,
//    y la suma de celdas por tipo es igual a ocupado.
//  - toRows produce 12 filas con posiciones 1..24 (impares a la izquierda,
//    pares a la derecha).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeSlots, gridStats, toRows, CAPACITY } from "./cargaLayout.js";

// Generador de una celda: vacía, un tipo ocupado válido, o basura (tipo inválido).
const cellArb = fc.oneof(
  fc.constant({ type: "E" }),
  fc.record({
    type: fc.constantFrom("S", "D", "T", "C"),
    lotId: fc.oneof(fc.string({ minLength: 1, maxLength: 12 }), fc.constant(undefined)),
    part: fc.oneof(fc.constantFrom("L", "R"), fc.integer({ min: 1, max: 4 }), fc.constant(undefined)),
  }),
  // Ruido: tipos inválidos o formas raras que deben tratarse como vacío.
  fc.record({ type: fc.constantFrom("X", "", "e", "s") }),
  fc.constant(null),
  fc.constant({}),
);

// Array de 0..30 celdas (a veces más/menos de 24 para probar la normalización).
const slotsArb = fc.array(cellArb, { minLength: 0, maxLength: 30 });

describe("cargaLayout — Property (carga): estadísticas del grid consistentes", () => {
  it("mantiene los invariantes del grid para cualquier array de slots (100+ iteraciones)", () => {
    fc.assert(
      fc.property(slotsArb, (slots) => {
        const cells = normalizeSlots(slots);
        // Siempre 24 celdas con tipo válido.
        expect(cells).toHaveLength(CAPACITY);
        for (const c of cells) {
          expect(["E", "S", "D", "T", "C"]).toContain(c.type);
        }

        const stats = gridStats(slots);
        const noVacias = cells.filter((c) => c.type !== "E").length;

        // ocupado = celdas no vacías = 24 - libre, en rango.
        expect(stats.ocupado).toBe(noVacias);
        expect(stats.ocupado).toBe(CAPACITY - stats.libre);
        expect(stats.ocupado).toBeGreaterThanOrEqual(0);
        expect(stats.ocupado).toBeLessThanOrEqual(CAPACITY);

        // progress = round(ocupado/24*100), en [0,100].
        expect(stats.progress).toBe(Math.round((stats.ocupado / CAPACITY) * 100));
        expect(stats.progress).toBeGreaterThanOrEqual(0);
        expect(stats.progress).toBeLessThanOrEqual(100);

        // Celdas por tipo: la suma es ocupado; los lotes por tipo no exceden sus celdas.
        const cellsByType = { S: 0, D: 0, T: 0, C: 0 };
        for (const c of cells) if (c.type !== "E") cellsByType[c.type] += 1;
        expect(cellsByType.S + cellsByType.D + cellsByType.T + cellsByType.C).toBe(stats.ocupado);
        for (const t of ["S", "D", "T", "C"]) {
          expect(stats.counts[t]).toBeLessThanOrEqual(cellsByType[t]);
          expect(stats.counts[t]).toBeGreaterThanOrEqual(cellsByType[t] > 0 ? 1 : 0);
        }

        // toRows: 12 filas, posiciones 1..24 (impares izquierda, pares derecha).
        const rows = toRows(cells);
        expect(rows).toHaveLength(CAPACITY / 2);
        rows.forEach((r, i) => {
          expect(r.left.pos).toBe(2 * i + 1);
          expect(r.right.pos).toBe(2 * i + 2);
          expect(r.left.pos % 2).toBe(1);
          expect(r.right.pos % 2).toBe(0);
        });
      }),
      { numRuns: 100 },
    );
  });
});
