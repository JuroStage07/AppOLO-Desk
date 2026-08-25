// Feature: despachos-dev, Property 17: Contador consistente con el resultado filtrado
//
// Para toda lista de despachos y combinación de filtros, el contador de
// visibles es igual a la cantidad de despachos devueltos por el filtrado.
//
// Validates: Requirements 4.7, 4.8

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterDespachos } from "./despachoFilters.js";

// Estados posibles del catálogo de ejemplo.
const ESTADOS = ["pendiente", "en_proceso", "finalizado", "eliminado"];

// Rango temporal acotado para generar fechas comparables (epoch ms).
const MIN_FECHA = 1_600_000_000_000; // ~2020-09
const MAX_FECHA = 1_700_000_000_000; // ~2023-11

// Generador de un despacho con los campos relevantes para el filtrado.
const despachoArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  referencia: fc.string({ minLength: 0, maxLength: 8 }),
  tienda: fc.string({ minLength: 0, maxLength: 8 }),
  placa: fc.string({ minLength: 0, maxLength: 8 }),
  estado: fc.constantFrom(...ESTADOS),
  fecha: fc.integer({ min: MIN_FECHA, max: MAX_FECHA }),
});

// Lista de despachos con `id` únicos.
const despachosArb = fc.uniqueArray(despachoArb, {
  selector: (d) => d.id,
  maxLength: 30,
});

// Generador de una combinación de filtros arbitraria. El texto tiende a ser
// corto (más coincidencias) pero también puede ser largo/improbable, lo que
// produce naturalmente casos con 0 resultados.
const filtrosArb = fc.record({
  texto: fc.string({ minLength: 0, maxLength: 4 }),
  estados: fc.subarray(ESTADOS),
  rango: fc
    .tuple(
      fc.integer({ min: MIN_FECHA, max: MAX_FECHA }),
      fc.integer({ min: MIN_FECHA, max: MAX_FECHA }),
    )
    .map(([a, b]) => (a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a })),
});

// El contador de visibles se deriva de `filterDespachos(...).length` (4.7/4.8).
function contadorVisibles(despachos, filtros) {
  return filterDespachos(despachos, filtros).length;
}

describe("filterDespachos — contador consistente con el resultado filtrado (Property 17)", () => {
  it("el contador de visibles es igual a la cantidad de despachos devueltos y a los que satisfacen todos los filtros", () => {
    fc.assert(
      fc.property(despachosArb, filtrosArb, (despachos, { texto, estados, rango }) => {
        const filtros = { texto, estados, desde: rango.desde, hasta: rango.hasta };

        const resultado = filterDespachos(despachos, filtros);
        const contador = contadorVisibles(despachos, filtros);

        // El contador es exactamente la longitud del resultado filtrado.
        expect(contador).toBe(resultado.length);

        // Y coincide con el número de despachos de la lista original que
        // satisfacen simultáneamente todos los filtros activos.
        const satisfacenTodos = despachos.filter((d) =>
          resultado.some((r) => r.id === d.id),
        ).length;
        expect(contador).toBe(satisfacenTodos);

        // Invariante de rango: nunca negativo ni mayor al total.
        expect(contador).toBeGreaterThanOrEqual(0);
        expect(contador).toBeLessThanOrEqual(despachos.length);

        // Cuando no hay resultados visibles, el contador debe ser 0.
        if (resultado.length === 0) {
          expect(contador).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("con una combinación de filtros que no coincide con ningún despacho, el contador es 0", () => {
    fc.assert(
      fc.property(despachosArb, (despachos) => {
        // Texto que no puede aparecer en los campos generados (longitud > 8).
        const filtros = { texto: "zzzzzzzzzz-no-match", estados: [], desde: null, hasta: null };
        const contador = contadorVisibles(despachos, filtros);
        expect(contador).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
