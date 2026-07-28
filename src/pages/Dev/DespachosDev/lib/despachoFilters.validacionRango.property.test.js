// Feature: despachos-dev, Property 15: Validación de rango de fechas
//
// Property 15: Validación de rango de fechas — Validates: Requirements 4.4
// "Para todo par (desde, hasta), isValidDateRange(desde, hasta) devuelve false si
// y solo si ambas fechas existen y desde es posterior a hasta; en ese caso el
// conjunto de despachos mostrados no se altera."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isValidDateRange, filterDespachos } from "./despachoFilters.js";

// Timestamp base (2020-01-01) para construir fechas deterministas a partir de
// desplazamientos en días. Mantiene los valores dentro de un rango razonable.
const BASE = Date.UTC(2020, 0, 1);
const DAY = 24 * 60 * 60 * 1000;

// Convierte un desplazamiento en días a una cadena ISO parseable por Date.parse.
const isoFromOffset = (days) => new Date(BASE + days * DAY).toISOString();

// Interpretación de "existe" idéntica a la del módulo (hasValue): distinto de
// null/undefined y distinto de cadena vacía.
const exists = (v) => v != null && v !== "";

// Generador de fechas "presentes": cadenas ISO derivadas de un desplazamiento.
const presentDate = fc
  .integer({ min: -3650, max: 3650 })
  .map((days) => isoFromOffset(days));

// Generador de valores "ausentes": null, undefined o cadena vacía (según hasValue).
const absentDate = fc.constantFrom(null, undefined, "");

// Un extremo cualquiera: presente o ausente. Cubre nulos y casos ambos-presentes.
const anyDate = fc.oneof(presentDate, absentDate);

// Generador de un despacho con `fecha` variable (presente o ausente) más otros
// campos irrelevantes para este filtro (texto vacío, estados vacíos).
const despachoArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }).map((n) => `d-${n}`),
  estado: fc.constantFrom("creado", "en proceso", "despachado", "rechazado"),
  fecha: fc.oneof(presentDate, absentDate),
});

const despachosArb = fc.array(despachoArb, { maxLength: 30 });

describe("despachoFilters.isValidDateRange — Property 15: Validación de rango de fechas", () => {
  it("devuelve false si y solo si ambas fechas existen y desde es posterior a hasta (100+ iteraciones)", () => {
    fc.assert(
      fc.property(anyDate, anyDate, (desde, hasta) => {
        const resultado = isValidDateRange(desde, hasta);

        const ambasExisten = exists(desde) && exists(hasta);
        const desdePosterior =
          ambasExisten && Date.parse(String(desde)) > Date.parse(String(hasta));

        // Bicondicional: inválido (false) ⟺ ambas existen y desde > hasta.
        expect(resultado).toBe(!desdePosterior);
      }),
      { numRuns: 100 },
    );
  });

  it("cuando el rango es inválido, filterDespachos no altera el conjunto mostrado (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        despachosArb,
        fc.integer({ min: -3650, max: 3650 }),
        fc.integer({ min: 1, max: 3650 }),
        (despachos, hastaDays, gapDays) => {
          // Construimos un rango deliberadamente inválido: desde estrictamente
          // posterior a hasta, con ambos extremos presentes.
          const hasta = isoFromOffset(hastaDays);
          const desde = isoFromOffset(hastaDays + gapDays);

          // Precondición: el rango es efectivamente inválido.
          expect(isValidDateRange(desde, hasta)).toBe(false);

          // Filtrado con rango inválido (texto vacío, estados vacíos).
          const conRangoInvalido = filterDespachos(despachos, {
            texto: "",
            estados: [],
            desde,
            hasta,
          });

          // Filtrado sin fechas: el conjunto de referencia "no alterado".
          const sinFechas = filterDespachos(despachos, {
            texto: "",
            estados: [],
            desde: null,
            hasta: null,
          });

          // El filtro de fechas inválido no altera los resultados: mismo conjunto,
          // mismo orden.
          expect(conRangoInvalido.map((d) => d.id)).toEqual(
            sinFechas.map((d) => d.id),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
