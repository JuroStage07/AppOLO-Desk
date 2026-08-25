// Feature: despachos-dev, Property 6: Formato de tarimas "S/D"
//
// Property 6: Formato de tarimas "S/D" — Validates: Requirements 3.1
// "Para todo par numérico (tarimas_s, tarimas_d), formatSD produce la cadena con
// el valor de tarimas_s a la izquierda de la barra y el de tarimas_d a la derecha;
// si un lado no es numérico, ese lado se sustituye por el placeholder de ausencia
// sin romper el formato."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatSD, PLACEHOLDER } from "./despachoFormat.js";

// Normalización esperada de un lado numérico según el módulo (String(Number(value))).
const norm = (n) => String(Number(n));

// Generadores de valores NO numéricos: cadenas no numéricas, nulos/indefinidos,
// booleanos, objetos, arreglos y NaN/Infinity. Ninguno es un número finito ni una
// cadena que represente un número finito.
const nonNumericValue = fc.oneof(
  // Cadenas no numéricas (evita que Number(str) sea finito): siempre contienen
  // al menos una letra, por lo que Number(...) resulta NaN.
  fc.string({ minLength: 1 }).map((s) => `${s}z`),
  fc.constantFrom(null, undefined, true, false, NaN, Infinity, -Infinity),
  fc.constant({}),
  fc.constant([1, 2, 3]),
  fc.constant(""),
  fc.constant("   "),
);

describe('despachoFormat.formatSD — Property 6: Formato de tarimas "S/D"', () => {
  it("para todo par numérico produce `${norm(s)}/${norm(d)}` (100+ iteraciones)", () => {
    const numericValue = fc.oneof(
      fc.integer(),
      fc.nat(),
      fc.integer({ min: -1000, max: 1000 }),
    );

    fc.assert(
      fc.property(numericValue, numericValue, (s, d) => {
        const resultado = formatSD(s, d);
        // Valor de tarimas_s a la izquierda de la barra, tarimas_d a la derecha.
        expect(resultado).toBe(`${norm(s)}/${norm(d)}`);
        // Exactamente un separador "/".
        expect(resultado.split("/").length).toBe(2);
      }),
      { numRuns: 100 },
    );
  });

  it("si un lado no es numérico, ese lado usa el placeholder y el otro se conserva (100+ iteraciones)", () => {
    const numericValue = fc.oneof(fc.integer(), fc.nat());

    fc.assert(
      fc.property(
        numericValue,
        nonNumericValue,
        fc.boolean(),
        (numero, noNumerico, ausenteEsIzquierda) => {
          if (ausenteEsIzquierda) {
            const resultado = formatSD(noNumerico, numero);
            expect(resultado).toBe(`${PLACEHOLDER}/${norm(numero)}`);
          } else {
            const resultado = formatSD(numero, noNumerico);
            expect(resultado).toBe(`${norm(numero)}/${PLACEHOLDER}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("si ambos lados son no numéricos, ambos usan el placeholder con la barra intacta (100+ iteraciones)", () => {
    fc.assert(
      fc.property(nonNumericValue, nonNumericValue, (a, b) => {
        const resultado = formatSD(a, b);
        expect(resultado).toBe(`${PLACEHOLDER}/${PLACEHOLDER}`);
        // El separador "/" nunca se rompe y el resultado nunca es vacío.
        expect(resultado).toContain("/");
        expect(resultado.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
