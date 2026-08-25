// Feature: despachos-dev, Property 10: Orden determinista de despachos dentro del grupo
//
// Property 10: Orden determinista de despachos dentro del grupo — Validates: Requirements 2.4
// "Para toda colección de despachos dentro de un grupo, quedan ordenados por
// created_at descendente; ante empates de created_at, quedan ordenados por
// id descendente."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sortDespachos, groupByEstado } from "./despachoGrouping.js";

// Conjunto pequeño de instantes `created_at` para forzar empates frecuentes y
// ejercitar el desempate por `id`. Incluye duplicados intencionales.
const CREATED_AT_POOL = [
  "2024-01-01T00:00:00.000Z",
  "2024-01-01T00:00:00.000Z", // duplicado intencional (tie-break)
  "2024-06-15T12:30:00.000Z",
  "2024-06-15T12:30:00.000Z", // duplicado intencional (tie-break)
  "2023-12-31T23:59:59.000Z",
  "2025-03-10T08:00:00.000Z",
];

// Genera una colección de despachos con `id` únicos (para que el desempate por
// id sea totalmente determinista) y `created_at` frecuentemente repetidos.
// Luego baraja el arreglo para que el orden de entrada no coincida con la salida.
const despachosArb = fc
  .array(fc.constantFrom(...CREATED_AT_POOL), { minLength: 0, maxLength: 30 })
  .map((createdAts) =>
    createdAts.map((created_at, index) => ({
      // ids únicos y de longitud fija para un orden por id determinista.
      id: `id-${String(index).padStart(3, "0")}`,
      created_at,
      estado: "creado",
      deleted_at: null,
    })),
  )
  .chain((despachos) =>
    fc.shuffledSubarray(despachos, {
      minLength: despachos.length,
      maxLength: despachos.length,
    }),
  );

// Verifica que cada par consecutivo respete: created_at desc, luego id desc.
function assertOrdenDespachos(lista) {
  for (let i = 0; i + 1 < lista.length; i += 1) {
    const a = lista[i];
    const b = lista[i + 1];

    // created_at no creciente (descendente).
    expect(a.created_at >= b.created_at).toBe(true);

    // Ante empate de created_at, id no creciente (descendente).
    if (a.created_at === b.created_at) {
      expect(a.id >= b.id).toBe(true);
    }
  }
}

describe("despachoGrouping.sortDespachos — Property 10: Orden determinista de despachos dentro del grupo", () => {
  it("ordena por created_at descendente y desempata por id descendente (100+ iteraciones)", () => {
    fc.assert(
      fc.property(despachosArb, (despachos) => {
        const ordenado = sortDespachos(despachos);

        // No se pierden ni agregan despachos.
        expect(ordenado).toHaveLength(despachos.length);

        assertOrdenDespachos(ordenado);
      }),
      { numRuns: 100 },
    );
  });

  it("mantiene el mismo orden dentro de cada grupo producido por groupByEstado", () => {
    fc.assert(
      fc.property(despachosArb, (despachos) => {
        const catalogo = [{ codigo: "creado", nombre: "Creado", orden: 0 }];
        const grupos = groupByEstado(despachos, catalogo);

        for (const grupo of grupos) {
          assertOrdenDespachos(grupo.despachos);
        }
      }),
      { numRuns: 100 },
    );
  });
});
