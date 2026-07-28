// Feature: despachos-dev, Property 3: Código desconocido usa valores neutros
//
// Property 3: Código desconocido usa valores neutros — Validates: Requirements 1.5
// "Para todo código de estado que no exista en el mapa local, colorFor devuelve
// el color neutro #9ca3af, el ícono es FileText y labelFor devuelve el propio
// código como etiqueta."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { colorFor, iconFor, labelFor } from "./mapaEstados.js";
import {
  ESTADO_COLORS,
  ESTADO_NEUTRO_COLOR,
  ESTADO_NEUTRO_ICON,
} from "../../../../styles/theme.js";

// Conjunto de códigos conocidos (fuente de verdad: tokens del tema). Cualquier
// código fuera de este conjunto se considera desconocido y debe usar valores
// neutros.
const CODIGOS_CONOCIDOS = new Set(Object.keys(ESTADO_COLORS));

describe("mapaEstados — Property 3: Código desconocido usa valores neutros", () => {
  it("colorFor/iconFor/labelFor devuelven valores neutros para códigos desconocidos (100+ iteraciones)", () => {
    // Genera cadenas arbitrarias y descarta las que coincidan con un código
    // conocido, dejando sólo códigos desconocidos en el espacio de entrada.
    const codigoDesconocido = fc
      .string()
      .filter((codigo) => !CODIGOS_CONOCIDOS.has(codigo));

    fc.assert(
      fc.property(codigoDesconocido, (codigo) => {
        expect(colorFor(codigo)).toBe(ESTADO_NEUTRO_COLOR);
        expect(colorFor(codigo)).toBe("#9ca3af");
        expect(iconFor(codigo)).toBe(ESTADO_NEUTRO_ICON);
        expect(iconFor(codigo)).toBe("FileText");
        expect(labelFor(codigo, [])).toBe(codigo);
      }),
      { numRuns: 100 },
    );
  });

  it("usa el propio código como etiqueta cuando el catálogo no lo contiene", () => {
    expect(labelFor("codigo_inexistente", [])).toBe("codigo_inexistente");
    expect(colorFor("codigo_inexistente")).toBe("#9ca3af");
    expect(iconFor("codigo_inexistente")).toBe("FileText");
  });
});
