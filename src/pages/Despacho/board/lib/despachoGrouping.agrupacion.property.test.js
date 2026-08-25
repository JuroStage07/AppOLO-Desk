// Feature: despachos-dev, Property 8: Agrupación excluye borrados/eliminados y no crea grupos vacíos
//
// Para toda lista de despachos y catálogo, la agrupación considera únicamente
// despachos con deleted_at nulo y estado <> 'eliminado', produce exactamente un
// grupo por cada código del catálogo con al menos un despacho asociado, no
// incluye el grupo eliminado, y ningún grupo resultante está vacío.
//
// Validates: Requirements 2.1, 2.2, 2.5

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { groupByEstado, ESTADO_ELIMINADO } from "./despachoGrouping.js";

// Generador de un catálogo con `codigo` únicos. Se incluye a veces el estado
// `eliminado` para verificar que nunca produce grupo.
const catalogoArb = fc
  .uniqueArray(
    fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 20 }),
      nombre: fc.string({ minLength: 1, maxLength: 40 }),
      orden: fc.integer({ min: -1000, max: 1000 }),
    }),
    { selector: (e) => e.codigo, maxLength: 12 },
  )
  .chain((cat) =>
    // Con cierta probabilidad, añade el código `eliminado` al catálogo si no
    // está presente ya (los códigos deben permanecer únicos).
    fc.boolean().map((incluirEliminado) => {
      if (incluirEliminado && !cat.some((e) => e.codigo === ESTADO_ELIMINADO)) {
        return [
          ...cat,
          { codigo: ESTADO_ELIMINADO, nombre: "Eliminado", orden: 999 },
        ];
      }
      return cat;
    }),
  );

// Genera despachos cuyo `estado` proviene de los códigos del catálogo (incluido
// posiblemente `eliminado`) más algún código arbitrario que puede no existir.
// `deleted_at` es a veces no nulo para ejercitar el filtrado de borrados.
function despachosArb(catalogo) {
  const codigosCatalogo = catalogo.map((e) => e.codigo);
  const estadoArb =
    codigosCatalogo.length > 0
      ? fc.oneof(
          fc.constantFrom(...codigosCatalogo),
          fc.constant(ESTADO_ELIMINADO),
          fc.string({ minLength: 1, maxLength: 20 }),
        )
      : fc.oneof(
          fc.constant(ESTADO_ELIMINADO),
          fc.string({ minLength: 1, maxLength: 20 }),
        );

  return fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 100000 }),
      estado: estadoArb,
      created_at: fc.integer({ min: 0, max: 1_000_000 }),
      deleted_at: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
    }),
    { maxLength: 40 },
  );
}

// Predicado de despacho activo, replicado para calcular el conjunto esperado.
function esActivo(d) {
  const noBorrado = d.deleted_at === null || d.deleted_at === undefined;
  return noBorrado && d.estado !== ESTADO_ELIMINADO;
}

describe("groupByEstado — excluye borrados/eliminados y no crea grupos vacíos (Property 8)", () => {
  it("agrupa solo despachos activos, un grupo no vacío por código del catálogo con despachos", () => {
    fc.assert(
      fc.property(
        catalogoArb.chain((catalogo) =>
          fc.record({
            catalogo: fc.constant(catalogo),
            despachos: despachosArb(catalogo),
          }),
        ),
        ({ catalogo, despachos }) => {
          const grupos = groupByEstado(despachos, catalogo);

          const codigosCatalogo = new Set(catalogo.map((e) => e.codigo));

          // Conjunto esperado: códigos del catálogo (excluyendo `eliminado`)
          // que tienen >= 1 despacho activo.
          const activos = despachos.filter(esActivo);
          const esperados = new Set(
            catalogo
              .map((e) => e.codigo)
              .filter(
                (codigo) =>
                  codigo !== ESTADO_ELIMINADO &&
                  activos.some((d) => d.estado === codigo),
              ),
          );

          const codigosGrupos = grupos.map((g) => g.codigo);

          // Ningún grupo tiene código `eliminado`.
          for (const g of grupos) {
            expect(g.codigo).not.toBe(ESTADO_ELIMINADO);
          }

          // Ningún grupo está vacío.
          for (const g of grupos) {
            expect(Array.isArray(g.despachos)).toBe(true);
            expect(g.despachos.length).toBeGreaterThan(0);
          }

          // Todo código de grupo existe en el catálogo.
          for (const codigo of codigosGrupos) {
            expect(codigosCatalogo.has(codigo)).toBe(true);
          }

          // Los códigos de grupo (como conjunto) son exactamente los esperados.
          expect(new Set(codigosGrupos)).toEqual(esperados);

          // Exactamente un grupo por código (sin duplicados).
          expect(codigosGrupos.length).toBe(new Set(codigosGrupos).size);

          // Cada grupo contiene únicamente despachos activos de ese estado.
          for (const g of grupos) {
            for (const d of g.despachos) {
              expect(esActivo(d)).toBe(true);
              expect(d.estado).toBe(g.codigo);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
