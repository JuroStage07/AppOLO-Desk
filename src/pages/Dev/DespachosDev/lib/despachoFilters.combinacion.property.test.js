// Feature: despachos-dev, Property 16: Combinación acumulativa de filtros (AND)
//
// Para toda lista de despachos y combinación de filtros (texto, estados, rango
// de fechas), el resultado del filtrado combinado es exactamente la
// intersección de aplicar cada filtro activo por separado.
//
// Validates: Requirements 4.5

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

// Lista de despachos con `id` únicos (para poder comparar por conjuntos de id).
const despachosArb = fc.uniqueArray(despachoArb, {
  selector: (d) => d.id,
  maxLength: 30,
});

// Generador de un objeto de filtro completo: texto, estados y rango válido.
const filtrosArb = fc.record({
  // Texto corto para lograr coincidencias reales con cierta frecuencia.
  texto: fc.string({ minLength: 0, maxLength: 3 }),
  // Subconjunto de estados (posiblemente vacío ⇒ todos).
  estados: fc.subarray(ESTADOS),
  // Rango válido: se generan dos fechas y se ordenan como [desde, hasta].
  rango: fc
    .tuple(
      fc.integer({ min: MIN_FECHA, max: MAX_FECHA }),
      fc.integer({ min: MIN_FECHA, max: MAX_FECHA }),
    )
    .map(([a, b]) => (a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a })),
});

describe("filterDespachos — combinación acumulativa de filtros (Property 16)", () => {
  it("el filtrado combinado es exactamente la intersección de los filtros individuales", () => {
    fc.assert(
      fc.property(despachosArb, filtrosArb, (despachos, { texto, estados, rango }) => {
        const { desde, hasta } = rango;

        // Resultado combinado: los tres filtros activos a la vez.
        const combinado = filterDespachos(despachos, {
          texto,
          estados,
          desde,
          hasta,
        });

        // Cada filtro aplicado individualmente sobre la lista original.
        const soloTexto = filterDespachos(despachos, { texto });
        const soloEstados = filterDespachos(despachos, { estados });
        const soloFechas = filterDespachos(despachos, { desde, hasta });

        // Intersección: filtramos la lista original preservando el orden,
        // conservando los despachos que pertenecen a los tres resultados.
        const idsTexto = new Set(soloTexto.map((d) => d.id));
        const idsEstados = new Set(soloEstados.map((d) => d.id));
        const idsFechas = new Set(soloFechas.map((d) => d.id));

        const interseccion = despachos.filter(
          (d) => idsTexto.has(d.id) && idsEstados.has(d.id) && idsFechas.has(d.id),
        );

        // filterDespachos preserva el orden de entrada, así que la intersección
        // calculada sobre la lista original debe coincidir exactamente (orden
        // incluido) con el resultado combinado.
        expect(combinado).toEqual(interseccion);
      }),
      { numRuns: 100 },
    );
  });
});
