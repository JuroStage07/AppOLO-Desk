// Feature: despachos-dev, Property 14: Rango de fechas inclusivo
//
// Property 14: Rango de fechas inclusivo — Validates: Requirements 4.3
// "Para toda lista de despachos y rango [desde, hasta] válido, un despacho es
// incluido si y solo si su campo fecha cumple desde ≤ fecha ≤ hasta (ambos
// extremos incluidos)."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterDespachos } from "./despachoFilters.js";

// El módulo interpreta `fecha` con `Date.parse(String(value))` para strings.
// Usamos strings ISO consistentes y comparamos por su timestamp numérico.
const toTime = (iso) => Date.parse(iso);
const isoOf = (ms) => new Date(ms).toISOString();

// Generador de un instante (ms epoch) dentro de un rango razonable de fechas.
const epochArb = fc.integer({
  min: Date.parse("2020-01-01T00:00:00.000Z"),
  max: Date.parse("2027-12-31T23:59:59.000Z"),
});

// Genera un rango válido [desde, hasta] con desde <= hasta (extremos ISO).
const rangoValidoArb = fc
  .tuple(epochArb, epochArb)
  .map(([a, b]) => (a <= b ? [a, b] : [b, a]))
  .map(([desde, hasta]) => ({ desdeMs: desde, hastaMs: hasta }));

// Construye la lista de despachos usando un pool de fechas que incluye
// deliberadamente los extremos exactos del rango (para ejercitar la igualdad
// en ambos bordes) además de fechas aleatorias dentro/fuera del rango.
function despachosArb({ desdeMs, hastaMs }) {
  const fechaPool = fc.oneof(
    fc.constant(desdeMs), // borde inferior exacto
    fc.constant(hastaMs), // borde superior exacto
    fc.constant(desdeMs - 1), // justo fuera por debajo
    fc.constant(hastaMs + 1), // justo fuera por arriba
    epochArb, // aleatorio
  );
  return fc.array(fechaPool, { minLength: 0, maxLength: 30 }).map((fechas) =>
    fechas.map((ms, index) => ({
      id: `id-${String(index).padStart(3, "0")}`,
      fecha: isoOf(ms),
      estado: "creado",
    })),
  );
}

describe("despachoFilters.filterDespachos — Property 14: Rango de fechas inclusivo", () => {
  it("incluye un despacho si y solo si desde ≤ fecha ≤ hasta (bordes incluidos)", () => {
    fc.assert(
      fc.property(
        rangoValidoArb.chain((rango) =>
          fc.record({
            rango: fc.constant(rango),
            despachos: despachosArb(rango),
          }),
        ),
        ({ rango, despachos }) => {
          const desde = isoOf(rango.desdeMs);
          const hasta = isoOf(rango.hastaMs);

          const resultado = filterDespachos(despachos, {
            texto: "",
            estados: [],
            desde,
            hasta,
          });

          const idsIncluidos = new Set(resultado.map((d) => d.id));

          for (const d of despachos) {
            const t = toTime(d.fecha);
            const debeIncluirse = t >= rango.desdeMs && t <= rango.hastaMs;
            expect(idsIncluidos.has(d.id)).toBe(debeIncluirse);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("incluye explícitamente los despachos en cada extremo del rango (igualdad)", () => {
    fc.assert(
      fc.property(rangoValidoArb, ({ desdeMs, hastaMs }) => {
        const desde = isoOf(desdeMs);
        const hasta = isoOf(hastaMs);

        const despachos = [
          { id: "borde-desde", fecha: desde, estado: "creado" },
          { id: "borde-hasta", fecha: hasta, estado: "creado" },
          { id: "fuera-abajo", fecha: isoOf(desdeMs - 1), estado: "creado" },
          { id: "fuera-arriba", fecha: isoOf(hastaMs + 1), estado: "creado" },
        ];

        const ids = new Set(
          filterDespachos(despachos, {
            texto: "",
            estados: [],
            desde,
            hasta,
          }).map((d) => d.id),
        );

        // Ambos extremos incluidos.
        expect(ids.has("borde-desde")).toBe(true);
        expect(ids.has("borde-hasta")).toBe(true);
        // Justo fuera del rango, excluidos.
        expect(ids.has("fuera-abajo")).toBe(false);
        expect(ids.has("fuera-arriba")).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
