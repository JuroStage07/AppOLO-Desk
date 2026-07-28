// Feature: despachos-dev, Property 1: Estados finales deterministas
//
// Property 1: Estados finales deterministas — Validates: Requirements 1.7
// "Para todo código de estado (conocido o arbitrario), isFinal(codigo) devuelve
// true si y solo si el código es exactamente `despachado` o `finalizado`, y
// false en cualquier otro caso."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isFinal } from "./mapaEstados.js";

// Códigos finales canónicos según el Requirement 1.7.
const CODIGOS_FINALES = ["despachado", "finalizado"];

// Códigos no finales conocidos (estados intermedios/no finales del dominio).
const CODIGOS_NO_FINALES = [
  "pendiente",
  "en_proceso",
  "en_progreso",
  "asignado",
  "cargando",
  "cancelado",
  "borrador",
  "",
];

describe("mapaEstados.isFinal — Property 1: Estados finales deterministas", () => {
  it("devuelve true si y solo si el código es exactamente 'despachado' o 'finalizado' (100+ iteraciones)", () => {
    // Generador que mezcla códigos finales conocidos, no finales conocidos y
    // cadenas arbitrarias, para cubrir todo el espacio de entrada relevante.
    const codigoArbitrario = fc.oneof(
      fc.constantFrom(...CODIGOS_FINALES),
      fc.constantFrom(...CODIGOS_NO_FINALES),
      fc.string(),
    );

    fc.assert(
      fc.property(codigoArbitrario, (codigo) => {
        const esperado = codigo === "despachado" || codigo === "finalizado";
        expect(isFinal(codigo)).toBe(esperado);
      }),
      { numRuns: 100 },
    );
  });

  it("devuelve true para cada código final canónico", () => {
    for (const codigo of CODIGOS_FINALES) {
      expect(isFinal(codigo)).toBe(true);
    }
  });

  it("devuelve false para códigos no finales conocidos", () => {
    for (const codigo of CODIGOS_NO_FINALES) {
      expect(isFinal(codigo)).toBe(false);
    }
  });
});
