// Feature: despachos-dev, Property 11: Orden estable de entradas de historial
//
// Property 11: Orden estable de entradas de historial — Validates: Requirements 6.2
// "Para toda colección de entradas de actividad, quedan ordenadas por created_at
// descendente; ante empates de created_at, el orden es estable y determinista por
// id descendente."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sortHistorial } from "./despachoGrouping.js";

// Generador de una entrada de actividad. `created_at` se toma de un conjunto
// pequeño de instantes para forzar empates frecuentes y ejercitar el desempate
// por `id`. `id` es único dentro de la colección (ver más abajo).
const CREATED_AT_POOL = [
  "2024-01-01T00:00:00.000Z",
  "2024-01-01T00:00:00.000Z", // duplicado intencional
  "2024-06-15T12:30:00.000Z",
  "2024-06-15T12:30:00.000Z", // duplicado intencional
  "2023-12-31T23:59:59.000Z",
  "2025-03-10T08:00:00.000Z",
];

// Genera una colección de entradas con `id` únicos (para que el desempate por id
// sea totalmente determinista) y `created_at` frecuentemente repetidos.
const entriesArb = fc
  .array(fc.constantFrom(...CREATED_AT_POOL), { minLength: 0, maxLength: 30 })
  .map((createdAts) =>
    createdAts.map((created_at, index) => ({
      // ids únicos y variados en longitud/valor para ejercitar el orden por id.
      id: `id-${String(index).padStart(3, "0")}`,
      created_at,
      descripcion: `evento ${index}`,
    })),
  )
  // Barajamos las entradas para que el orden de entrada no coincida con el de salida.
  .chain((entries) =>
    fc.constant(entries).chain((e) =>
      fc.shuffledSubarray(e, { minLength: e.length, maxLength: e.length }),
    ),
  );

describe("despachoGrouping.sortHistorial — Property 11: Orden estable de entradas de historial", () => {
  it("ordena por created_at descendente y desempata por id descendente (100+ iteraciones)", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const ordenado = sortHistorial(entries);

        // Mismo tamaño (no se pierden ni agregan entradas).
        expect(ordenado).toHaveLength(entries.length);

        // Cada par consecutivo respeta el orden requerido.
        for (let i = 0; i + 1 < ordenado.length; i += 1) {
          const a = ordenado[i];
          const b = ordenado[i + 1];

          // created_at no creciente (descendente).
          expect(a.created_at >= b.created_at).toBe(true);

          // Ante empate de created_at, id no creciente (descendente).
          if (a.created_at === b.created_at) {
            expect(a.id >= b.id).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("es determinista: ordenar la misma entrada dos veces produce el mismo orden", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const primera = sortHistorial(entries);
        const segunda = sortHistorial(entries);
        expect(segunda).toEqual(primera);
      }),
      { numRuns: 100 },
    );
  });

  it("no muta el arreglo de entrada", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const copia = entries.map((e) => ({ ...e }));
        sortHistorial(entries);
        // El arreglo original conserva su contenido y orden.
        expect(entries).toEqual(copia);
      }),
      { numRuns: 100 },
    );
  });
});
