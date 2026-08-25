// Feature: despachos-dev, Property 19: Detección de transición en el historial
//
// Property 19: Detección de transición en el historial — Validates: Requirements 6.5, 6.6
// "Para todo objeto detalle de una entrada de actividad, parseTransicion(detalle)
// devuelve una transición { estadoAnterior, estadoNuevo } si y solo si ambos campos
// existen y son no vacíos; en cualquier otro caso devuelve null."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseTransicion } from "./historialDetalle.js";

// Predicado de referencia (independiente de la implementación): un valor cuenta
// como "estado presente y no vacío" cuando es un string que, tras recortar
// espacios, no queda vacío.
function esEstadoValido(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Generador de valores para los campos estadoAnterior/estadoNuevo. Mezcla
// deliberadamente casos válidos e inválidos para ejercitar el "si y solo si":
// - strings no vacíos (incluye acentos/mayúsculas y con espacios internos)
// - strings vacíos y solo-espacios (inválidos)
// - valores no string (número, boolean, null, undefined, objeto, arreglo)
const valorCampoArb = fc.oneof(
  // Strings no vacíos tras trim (válidos).
  fc.constantFrom("creado", "en proceso", "DESPACHADO", "réchazado", "  completo  "),
  // Strings genéricos (pueden ser vacíos o no vacíos).
  fc.string(),
  // Strings vacíos / solo espacios (inválidos).
  fc.constantFrom("", "   ", "\t", "\n", " \t \n "),
  // No strings (inválidos).
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({ x: 1 }),
  fc.constant([1, 2]),
);

// Genera un objeto detalle donde cada campo puede estar presente o ausente.
const detalleObjetoArb = fc.record(
  {
    estadoAnterior: valorCampoArb,
    estadoNuevo: valorCampoArb,
    // Campos extra que no deben afectar la detección.
    otro: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
  },
  { requiredKeys: [] },
);

// Genera valores de detalle que NO son objetos planos válidos.
const detalleNoObjetoArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.anything()),
);

describe("historialDetalle.parseTransicion — Property 19: Detección de transición en el historial", () => {
  it("devuelve la transición si y solo si ambos estados existen y son no vacíos (objetos)", () => {
    fc.assert(
      fc.property(detalleObjetoArb, (detalle) => {
        const resultado = parseTransicion(detalle);
        const debeSerTransicion =
          esEstadoValido(detalle.estadoAnterior) && esEstadoValido(detalle.estadoNuevo);

        if (debeSerTransicion) {
          // Devuelve un objeto con exactamente los dos campos esperados.
          expect(resultado).not.toBeNull();
          expect(resultado).toEqual({
            estadoAnterior: detalle.estadoAnterior,
            estadoNuevo: detalle.estadoNuevo,
          });
          // Los valores devueltos son los originales (sin recortar).
          expect(resultado.estadoAnterior).toBe(detalle.estadoAnterior);
          expect(resultado.estadoNuevo).toBe(detalle.estadoNuevo);
        } else {
          expect(resultado).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("devuelve null para detalle nulo/indefinido/no objeto", () => {
    fc.assert(
      fc.property(detalleNoObjetoArb, (detalle) => {
        expect(parseTransicion(detalle)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
