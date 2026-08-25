// Feature: despachos-dev, Property 12: Búsqueda de texto parcial e insensible a mayúsculas
//
// Property 12: Búsqueda de texto parcial e insensible a mayúsculas — Validates: Requirements 4.1
// "Para toda lista de despachos y texto de búsqueda, un despacho es incluido si y
// solo si al menos uno de sus campos referencia, tienda o placa contiene el texto
// como subcadena, comparando sin distinguir mayúsculas/minúsculas."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterDespachos } from "./despachoFilters.js";

// Oráculo independiente que refleja exactamente la semántica del filtro de texto:
// coincidencia parcial (subcadena) insensible a mayúsculas sobre referencia,
// tienda y placa. Texto vacío/ausente ⇒ incluye todos.
function incluyePorTexto(despacho, texto) {
  if (texto == null || texto === "") return true;
  const needle = String(texto).toLowerCase();
  const campos = [despacho?.referencia, despacho?.tienda, despacho?.placa];
  return campos.some(
    (campo) => campo != null && String(campo).toLowerCase().includes(needle),
  );
}

// Aplica solo el filtro de texto (estados vacío, fechas nulas).
const soloTexto = (texto) => ({ texto, estados: [], desde: null, hasta: null });

// Valor de campo: cadenas con mezcla de mayúsculas/minúsculas y acentos, más
// ausencias (null) para ejercitar la guarda `campo != null`.
const campoValor = fc.oneof(
  fc.string({ minLength: 0, maxLength: 12 }),
  fc.constantFrom(
    "Referencia-Áéíóú",
    "TIENDA Ñandú",
    "PLACA-123",
    "camión Über",
    "Bogotá",
    "MedellíN",
    "",
  ),
  fc.constant(null),
);

const despachoArb = fc.record({
  referencia: campoValor,
  tienda: campoValor,
  placa: campoValor,
});

describe("despachoFilters.filterDespachos — Property 12: Búsqueda de texto parcial e insensible a mayúsculas", () => {
  it("un despacho se incluye syss algún campo (en minúsculas) contiene el texto (en minúsculas) (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        fc.array(despachoArb, { maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 6 }),
        (despachos, texto) => {
          const resultado = filterDespachos(despachos, soloTexto(texto));
          const esperado = despachos.filter((d) => incluyePorTexto(d, texto));
          // Mismo conjunto y mismo orden (filter preserva orden y referencias).
          expect(resultado).toEqual(esperado);
          // Cada despacho incluido satisface el oráculo; cada excluido no.
          for (const d of despachos) {
            const incluido = resultado.includes(d);
            expect(incluido).toBe(incluyePorTexto(d, texto));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("es insensible a mayúsculas: buscar en cualquier casing da el mismo resultado (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        fc.array(despachoArb, { maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 6 }),
        (despachos, texto) => {
          const enMinusculas = filterDespachos(despachos, soloTexto(texto.toLowerCase()));
          const enMayusculas = filterDespachos(despachos, soloTexto(texto.toUpperCase()));
          expect(enMayusculas).toEqual(enMinusculas);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cuando el texto es subcadena de un campo (con casing distinto), el despacho se incluye (100+ iteraciones)", () => {
    // Generador dirigido: construye un campo que garantiza contener el texto.
    const casoDirigido = fc
      .record({
        pre: fc.string({ maxLength: 5 }),
        nucleo: fc.string({ minLength: 1, maxLength: 6 }),
        post: fc.string({ maxLength: 5 }),
        campoObjetivo: fc.constantFrom("referencia", "tienda", "placa"),
        flipCase: fc.boolean(),
      })
      .map(({ pre, nucleo, post, campoObjetivo, flipCase }) => {
        const contenido = `${pre}${nucleo}${post}`;
        const despacho = { referencia: null, tienda: null, placa: null };
        despacho[campoObjetivo] = contenido;
        const texto = flipCase ? nucleo.toUpperCase() : nucleo.toLowerCase();
        return { despacho, texto };
      });

    fc.assert(
      fc.property(casoDirigido, ({ despacho, texto }) => {
        const resultado = filterDespachos([despacho], soloTexto(texto));
        // El campo contiene el núcleo como subcadena, comparado sin casing.
        expect(resultado).toEqual([despacho]);
      }),
      { numRuns: 100 },
    );
  });

  it("texto vacío no filtra: incluye todos los despachos (100+ iteraciones)", () => {
    fc.assert(
      fc.property(fc.array(despachoArb, { maxLength: 20 }), (despachos) => {
        const resultado = filterDespachos(despachos, soloTexto(""));
        expect(resultado).toEqual(despachos);
      }),
      { numRuns: 100 },
    );
  });
});
