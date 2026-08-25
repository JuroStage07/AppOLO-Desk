// Feature: despachos-dev, Property 13: Filtro de estado múltiple
//
// Para toda lista de despachos y selección de estados, si la selección está
// vacía se incluyen todos los despachos; en caso contrario, un despacho es
// incluido si y solo si su `estado` pertenece a la selección.
//
// Validates: Requirements 4.2

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterDespachos } from "./despachoFilters.js";

// Pool pequeño de estados para provocar coincidencias frecuentes entre los
// estados de los despachos y la selección de filtro.
const ESTADO_POOL = [
  "creado",
  "en proceso",
  "chofer_pendiente",
  "completo",
  "pendiente_validacion",
  "despachado",
  "rechazado",
  "finalizado",
];

const estadoArb = fc.constantFrom(...ESTADO_POOL);

// Un despacho con estado del pool; el resto de campos son irrelevantes para
// este filtro pero se incluyen para asemejar la forma real.
const despachoArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  estado: estadoArb,
  referencia: fc.string({ maxLength: 8 }),
  tienda: fc.string({ maxLength: 8 }),
  placa: fc.string({ maxLength: 8 }),
});

const despachosArb = fc.array(despachoArb, { maxLength: 30 });

// Selección de estados: a veces vacía, a veces un subconjunto único del pool.
const estadosSeleccionArb = fc.oneof(
  fc.constant([]),
  fc.uniqueArray(estadoArb, { minLength: 1, maxLength: ESTADO_POOL.length }),
);

describe("filterDespachos — filtro de estado múltiple (Property 13)", () => {
  it("selección vacía incluye todos; en otro caso incluye iff estado ∈ selección", () => {
    fc.assert(
      fc.property(despachosArb, estadosSeleccionArb, (despachos, estados) => {
        const resultado = filterDespachos(despachos, {
          texto: "",
          estados,
          desde: null,
          hasta: null,
        });

        if (estados.length === 0) {
          // Selección vacía ⇒ se incluyen todos los despachos, sin alterar.
          expect(resultado).toEqual(despachos);
          return;
        }

        // Selección no vacía ⇒ incluido si y solo si su estado pertenece.
        const esperado = despachos.filter((d) => estados.includes(d.estado));
        expect(resultado).toEqual(esperado);

        // Refuerzo del "si y solo si": todo resultado pertenece a la selección
        // y ningún despacho con estado en la selección queda fuera.
        for (const d of resultado) {
          expect(estados.includes(d.estado)).toBe(true);
        }
        for (const d of despachos) {
          if (estados.includes(d.estado)) {
            expect(resultado).toContain(d);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
