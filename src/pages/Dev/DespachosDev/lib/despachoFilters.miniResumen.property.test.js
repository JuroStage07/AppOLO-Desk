// Feature: despachos-dev, Property 18: Conteos por estado del mini-resumen
//
// Para todo conjunto de despachos visibles, la suma de los conteos por estado
// del mini-resumen es igual al total de despachos visibles, y el conteo de cada
// estado es igual a la cantidad de visibles con ese estado.
//
// Validates: Requirements 4.9

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { countByEstado } from "./despachoFilters.js";

// Pool de estados variado, incluyendo valores nulos/ausentes para ejercitar el
// manejo de clave "" que hace `countByEstado` (estado == null ⇒ "").
const ESTADO_POOL = [
  "creado",
  "en proceso",
  "chofer_pendiente",
  "completo",
  "pendiente_validacion",
  "despachado",
  "rechazado",
  "finalizado",
  null,
  undefined,
];

const estadoArb = fc.constantFrom(...ESTADO_POOL);

// Un despacho visible; solo `estado` es relevante para el mini-resumen, pero se
// incluyen otros campos para asemejar la forma real.
const despachoArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  estado: estadoArb,
  referencia: fc.string({ maxLength: 8 }),
});

const visiblesArb = fc.array(despachoArb, { maxLength: 40 });

// Réplica de la normalización de clave usada por `countByEstado`.
const keyOf = (estado) => (estado == null ? "" : String(estado));

describe("countByEstado — conteos por estado del mini-resumen (Property 18)", () => {
  it("la suma de conteos es el total de visibles y cada conteo coincide con su estado", () => {
    fc.assert(
      fc.property(visiblesArb, (visibles) => {
        const counts = countByEstado(visibles);

        // La suma de todos los conteos es igual al total de despachos visibles.
        const suma = Object.values(counts).reduce((acc, n) => acc + n, 0);
        expect(suma).toBe(visibles.length);

        // El conteo de cada estado es igual a la cantidad de visibles con ese
        // estado (usando la misma normalización de clave que el módulo).
        for (const [key, count] of Object.entries(counts)) {
          const esperado = visibles.filter(
            (d) => keyOf(d.estado) === key,
          ).length;
          expect(count).toBe(esperado);
        }

        // Refuerzo inverso: toda clave presente entre los visibles aparece en
        // los conteos con el valor correcto (no faltan estados).
        for (const d of visibles) {
          const key = keyOf(d.estado);
          const esperado = visibles.filter(
            (x) => keyOf(x.estado) === key,
          ).length;
          expect(counts[key]).toBe(esperado);
        }
      }),
      { numRuns: 100 },
    );
  });
});
