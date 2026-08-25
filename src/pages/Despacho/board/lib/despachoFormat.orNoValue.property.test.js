// Feature: despachos-dev, Property 5: Placeholder de ausencia siempre visible
//
// Property 5: Placeholder de ausencia siempre visible — Validates: Requirements 3.6, 5.3, 5.8
// "Para todo valor de campo que sea nulo, vacío, solo espacios o no numérico
// cuando se espera numérico, la utilidad de formato (orNoValue/formatSD) produce
// un texto visible no vacío (nunca cadena vacía ni solo espacios) y no interrumpe
// el formateo del resto."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { orNoValue, formatSD, PLACEHOLDER } from "./despachoFormat.js";

// Un texto es "visible" cuando es una cadena no vacía y no está compuesta solo
// por espacios en blanco.
function esTextoVisible(texto) {
  return typeof texto === "string" && texto.trim().length > 0;
}

// Generador de cadenas compuestas exclusivamente por caracteres de espacio en
// blanco (espacios, tabs, saltos de línea), incluyendo la cadena vacía.
const whitespaceOnly = fc.string({
  unit: fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"),
  minLength: 0,
  maxLength: 10,
});

// Valores considerados "ausentes": nulo, indefinido, cadena vacía o solo espacios.
const valorAusente = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  whitespaceOnly,
);

// Valores no numéricos para los lados de formatSD: ausentes, texto no numérico,
// booleanos, objetos y NaN/Infinity.
const noNumerico = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  whitespaceOnly,
  fc.string().filter((s) => !Number.isFinite(Number(s.trim())) || s.trim() === ""),
  fc.constantFrom(NaN, Infinity, -Infinity),
  fc.boolean(),
  fc.constantFrom("abc", "N/A", "—", "12a", "$", "uno"),
);

// Valores numéricos válidos (números finitos o cadenas numéricas) para el otro
// lado de formatSD.
const numerico = fc.oneof(
  fc.integer({ min: -9999, max: 9999 }),
  fc.integer({ min: -9999, max: 9999 }).map((n) => String(n)),
);

describe("despachoFormat — Property 5: Placeholder de ausencia siempre visible", () => {
  it("orNoValue(valor ausente) devuelve un texto visible no vacío (100+ iteraciones)", () => {
    fc.assert(
      fc.property(valorAusente, (valor) => {
        const resultado = orNoValue(valor);
        expect(esTextoVisible(resultado)).toBe(true);
        expect(resultado).toBe(PLACEHOLDER);
      }),
      { numRuns: 100 },
    );
  });

  it("orNoValue(cualquier valor) nunca devuelve cadena vacía ni solo espacios (100+ iteraciones)", () => {
    const cualquierValor = fc.oneof(
      valorAusente,
      fc.string(),
      fc.integer(),
      fc.double(),
      fc.boolean(),
      fc.constantFrom(NaN, Infinity, -Infinity),
    );

    fc.assert(
      fc.property(cualquierValor, (valor) => {
        const resultado = orNoValue(valor);
        expect(esTextoVisible(resultado)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("formatSD conserva el separador '/' y usa el placeholder por lado no numérico (100+ iteraciones)", () => {
    fc.assert(
      fc.property(noNumerico, noNumerico, (s, d) => {
        const resultado = formatSD(s, d);

        // El resultado es siempre un texto visible no vacío.
        expect(esTextoVisible(resultado)).toBe(true);

        // Debe conservar exactamente un separador "/" (formato "<S>/<D>").
        const partes = resultado.split("/");
        expect(partes).toHaveLength(2);

        // Cada lado no numérico se sustituye por el placeholder sin interrumpir
        // el formateo del otro lado.
        expect(partes[0]).toBe(PLACEHOLDER);
        expect(partes[1]).toBe(PLACEHOLDER);
      }),
      { numRuns: 100 },
    );
  });

  it("formatSD con un lado no numérico placeholderiza solo ese lado y no interrumpe el resto (100+ iteraciones)", () => {
    fc.assert(
      fc.property(noNumerico, numerico, (malo, bueno) => {
        // Lado izquierdo no numérico, derecho numérico.
        const izquierdo = formatSD(malo, bueno);
        const partesIzq = izquierdo.split("/");
        expect(partesIzq).toHaveLength(2);
        expect(partesIzq[0]).toBe(PLACEHOLDER);
        expect(partesIzq[1]).toBe(String(Number(bueno)));
        expect(esTextoVisible(izquierdo)).toBe(true);

        // Lado derecho no numérico, izquierdo numérico.
        const derecho = formatSD(bueno, malo);
        const partesDer = derecho.split("/");
        expect(partesDer).toHaveLength(2);
        expect(partesDer[0]).toBe(String(Number(bueno)));
        expect(partesDer[1]).toBe(PLACEHOLDER);
        expect(esTextoVisible(derecho)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
