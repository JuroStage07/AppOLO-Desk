// Feature: despachos-dev, Property 9: Orden determinista de grupos
//
// Para todo catálogo, los grupos quedan ordenados de forma ascendente por
// `orden`; ante empates de `orden`, quedan ordenados alfabéticamente
// ascendente por `nombre`.
//
// Validates: Requirements 2.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { groupByEstado } from "./despachoGrouping.js";

// Generador de un catálogo con códigos únicos. `orden` usa un rango pequeño
// para provocar empates frecuentes (y ejercitar el desempate por `nombre`).
// `nombre` incluye mayúsculas/acentos para ejercitar `localeCompare`.
const catalogoArb = fc
  .uniqueArray(
    fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 12 }),
      nombre: fc.string({ minLength: 1, maxLength: 24 }),
      orden: fc.integer({ min: 0, max: 3 }),
    }),
    { selector: (e) => e.codigo, minLength: 1, maxLength: 12 },
  )
  // El grupo `eliminado` nunca se produce; lo excluimos del catálogo para
  // garantizar que cada código genere un grupo visible.
  .filter((cat) => cat.every((e) => e.codigo !== "eliminado"));

describe("groupByEstado — orden determinista de grupos (Property 9)", () => {
  it("ordena los grupos por orden ascendente y desempata por nombre ascendente", () => {
    fc.assert(
      fc.property(catalogoArb, (catalogo) => {
        // Aseguramos que cada código del catálogo tenga al menos un despacho
        // activo, de modo que se produzca su grupo (sin grupos vacíos).
        const despachos = catalogo.map((estado, i) => ({
          id: `d-${i}`,
          estado: estado.codigo,
          created_at: i,
          deleted_at: null,
        }));

        const grupos = groupByEstado(despachos, catalogo);

        // Con un despacho activo por código, hay un grupo por cada entrada.
        expect(grupos.length).toBe(catalogo.length);

        // Comparador de nombre espejo del módulo:
        // String(a.nombre ?? "").localeCompare(String(b.nombre ?? "")).
        for (let i = 1; i < grupos.length; i++) {
          const prev = grupos[i - 1];
          const curr = grupos[i];

          const ordPrev = Number(prev.orden);
          const ordCurr = Number(curr.orden);

          // orden no decreciente entre grupos consecutivos.
          expect(ordPrev).toBeLessThanOrEqual(ordCurr);

          // ante empate de orden, nombre en orden no descendente por localeCompare.
          if (ordPrev === ordCurr) {
            const cmp = String(prev.nombre ?? "").localeCompare(
              String(curr.nombre ?? ""),
            );
            expect(cmp).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
