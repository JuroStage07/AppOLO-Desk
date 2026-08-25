// Feature: despachos-dev, Property 4: Insignia de estado comunica con texto y color
//
// Property 4: Insignia de estado comunica con texto y color
// Validates: Requirements 3.2, 3.3, 5.4, 11.1
// "Para todo despacho con cualquier estado (incluidos códigos desconocidos), la
// insignia de estado (EstadoBadge) renderiza un texto legible no vacío que
// identifica el estado, además de aplicar un color; nunca comunica el estado
// solo por color."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { render, cleanup } from "@testing-library/react";
import EstadoBadge from "./EstadoBadge.jsx";
import { ESTADO_COLORS } from "../../../../styles/theme.js";

// Códigos conocidos: llaves del token de tema ESTADO_COLORS (fuente de verdad).
const CODIGOS_CONOCIDOS = Object.keys(ESTADO_COLORS);
const CONJUNTO_CONOCIDOS = new Set(CODIGOS_CONOCIDOS);

// Generador de códigos conocidos (los que sí existen en el mapa de tokens).
const codigoConocido = fc.constantFrom(...CODIGOS_CONOCIDOS);

// Generador de códigos desconocidos: cadenas arbitrarias con contenido visible
// (trim no vacío) que no coincidan con ningún código conocido. Se restringe el
// espacio de entrada a códigos "reales" (no cadenas de solo espacios), acorde
// con el dominio de un código de estado.
const codigoDesconocido = fc
  .string()
  .filter((s) => s.trim().length > 0 && !CONJUNTO_CONOCIDOS.has(s));

// Unión: cualquier estado, conocido o desconocido.
const codigoCualquiera = fc.oneof(codigoConocido, codigoDesconocido);

describe("EstadoBadge — Property 4: comunica el estado con texto y color", () => {
  it("renderiza texto legible no vacío y aplica color para cualquier estado (100+ iteraciones)", () => {
    fc.assert(
      fc.property(codigoCualquiera, (codigo) => {
        // Render aislado por iteración; se limpia el DOM al final para evitar
        // acumulación entre corridas de la propiedad.
        const { container } = render(
          <EstadoBadge codigo={codigo} catalogo={[]} />,
        );
        try {
          const badge = container.firstElementChild;
          expect(badge).not.toBeNull();

          // 1) Texto legible: no vacío ni solo espacios (nunca solo color).
          const visible = badge.textContent.trim();
          expect(visible.length).toBeGreaterThan(0);

          // 2) Color aplicado: el badge lleva estilos de color/fondo/borde.
          expect(badge.style.color).not.toBe("");
          expect(badge.style.background).not.toBe("");
          expect(badge.style.border).not.toBe("");
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("para códigos desconocidos, el texto visible es el propio código", () => {
    fc.assert(
      fc.property(codigoDesconocido, (codigo) => {
        const { container } = render(
          <EstadoBadge codigo={codigo} catalogo={[]} />,
        );
        try {
          const badge = container.firstElementChild;
          expect(badge.textContent.trim()).toBe(codigo.trim());
          // Aun siendo desconocido, aplica un color (neutro), no solo texto.
          expect(badge.style.color).not.toBe("");
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });
});
