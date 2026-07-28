// Feature: despachos-dev, Property 2: nombre y orden provienen del catálogo
//
// Para todo catálogo de estados, el mapa de estados construido expone, para
// cada estado del catálogo, el mismo nombre y el mismo orden presentes en el
// catálogo (fuente de verdad).
//
// Validates: Requirements 1.3

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildMapaEstados } from "./mapaEstados.js";

// Generador de un catálogo con códigos únicos. Cada entrada expone un `nombre`
// no vacío y un `orden` numérico, que son los campos que `buildMapaEstados`
// toma del catálogo como fuente de verdad.
const catalogoArb = fc
  .uniqueArray(
    fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 20 }),
      nombre: fc.string({ minLength: 1, maxLength: 40 }),
      orden: fc.integer({ min: -1000, max: 1000 }),
      es_final: fc.boolean(),
      es_activo: fc.boolean(),
    }),
    { selector: (e) => e.codigo, maxLength: 25 },
  );

describe("buildMapaEstados — nombre y orden provienen del catálogo (Property 2)", () => {
  it("expone el mismo nombre y orden del catálogo para cada estado", () => {
    fc.assert(
      fc.property(catalogoArb, (catalogo) => {
        const mapa = buildMapaEstados(catalogo);

        for (const entry of catalogo) {
          const resultado = mapa.get(entry.codigo);

          // nombre proviene del catálogo (fuente de verdad).
          expect(resultado.nombre).toBe(entry.nombre);
          expect(mapa.label(entry.codigo)).toBe(entry.nombre);

          // orden proviene del catálogo (fuente de verdad).
          expect(resultado.orden).toBe(entry.orden);
        }
      }),
      { numRuns: 100 },
    );
  });
});
