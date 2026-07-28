// Feature: despachos-dev, Property 20: Reductor realtime respeta el scope
//
// Property 20: Reductor realtime respeta el scope — Validates: Requirements 7.2, 7.3
// "Para toda lista de despachos en scope y todo evento realtime, si el evento
// corresponde a un despacho dentro del Scope_Usuario el reductor aplica la
// inserción/actualización/eliminación únicamente sobre el despacho afectado
// (por id) dejando el resto intacto; si el evento corresponde a un despacho
// fuera del scope, la lista permanece sin cambios."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { realtimeReducer } from "./realtimeReducer.js";

// --- Generadores -----------------------------------------------------------

// Tokens de scope no vacíos (tras normalización con trim). Un scope no vacío es
// necesario para que la pertenencia por scope sea significativa: con scope
// totalmente vacío `sameTenantScope` acepta todo por compatibilidad legacy.
const tokenArb = fc.constantFrom(
  "t1",
  "t2",
  "OLO",
  "COFERSA",
  "CR",
  "VNZ",
  "alpha",
  "beta",
);

const scopeArb = fc.record({
  tenantId: tokenArb,
  company: tokenArb,
  bodegaId: tokenArb,
});

// Construye una fila (snake_case de Supabase) dentro del scope dado.
function inScopeRow(scope, id, extra = {}) {
  return {
    id,
    tenant_id: scope.tenantId,
    company: scope.company,
    bodega_id: scope.bodegaId,
    ...extra,
  };
}

// Genera una lista de despachos en scope con ids únicos.
function listArb(scope, { minLength = 0, maxLength = 8 } = {}) {
  return fc
    .uniqueArray(fc.uuid(), { minLength, maxLength })
    .map((ids) =>
      ids.map((id, i) => inScopeRow(scope, id, { referencia: `ref-${i}` })),
    );
}

// A partir de un scope válido, produce una versión fuera de scope alterando al
// menos uno de los tres campos a un valor garantizadamente distinto.
const outOfScopeFieldsArb = (scope) =>
  fc
    .subarray(["tenant_id", "company", "bodega_id"], { minLength: 1 })
    .map((campos) => {
      const fields = {
        tenant_id: scope.tenantId,
        company: scope.company,
        bodega_id: scope.bodegaId,
      };
      for (const campo of campos) fields[campo] = `${fields[campo]}__DIFF`;
      return fields;
    });

const eventTypeArb = fc.constantFrom("INSERT", "UPDATE", "DELETE");

// Verifica que dos listas contienen exactamente los mismos elementos por
// referencia en el mismo orden (nada mutado, nada perdido).
function sameByReference(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
}

// --- Property 20 -----------------------------------------------------------

describe("realtimeReducer — Property 20: Reductor realtime respeta el scope", () => {
  it("INSERT en scope (id nuevo) agrega exactamente ese despacho y deja el resto intacto (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        scopeArb.chain((scope) =>
          fc.record({
            scope: fc.constant(scope),
            list: listArb(scope),
            newId: fc.uuid(),
          }),
        ),
        ({ scope, list, newId }) => {
          // El id nuevo no debe estar presente (uuid colisiona con probabilidad nula,
          // pero filtramos para robustez).
          fc.pre(!list.some((d) => d.id === newId));

          const row = inScopeRow(scope, newId, { referencia: "nuevo" });
          const result = realtimeReducer(list, { type: "INSERT", new: row }, scope);

          // Crece exactamente en 1 y el nuevo id aparece.
          expect(result).toHaveLength(list.length + 1);
          expect(result).toEqual([...list, row]);
          // El resto queda intacto (mismas referencias, mismo orden).
          expect(sameByReference(result.slice(0, list.length), list)).toBe(true);
          // No se muta la lista de entrada.
          expect(result).not.toBe(list);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("UPDATE en scope (id existente) reemplaza solo ese despacho y deja el resto intacto (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        scopeArb.chain((scope) =>
          listArb(scope, { minLength: 1, maxLength: 8 }).chain((list) =>
            fc.record({
              scope: fc.constant(scope),
              list: fc.constant(list),
              idx: fc.integer({ min: 0, max: list.length - 1 }),
            }),
          ),
        ),
        ({ scope, list, idx }) => {
          const targetId = list[idx].id;
          const row = inScopeRow(scope, targetId, { referencia: "ACTUALIZADO" });
          const result = realtimeReducer(list, { type: "UPDATE", new: row }, scope);

          // Longitud invariante y el afectado reemplazado por la nueva fila.
          expect(result).toHaveLength(list.length);
          expect(result[idx]).toBe(row);
          // Únicamente el id afectado cambia: el resto conserva su referencia.
          for (let j = 0; j < list.length; j += 1) {
            if (j === idx) continue;
            expect(result[j]).toBe(list[j]);
          }
          expect(result).not.toBe(list);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("DELETE en scope elimina solo ese despacho y deja el resto intacto (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        scopeArb.chain((scope) =>
          listArb(scope, { minLength: 1, maxLength: 8 }).chain((list) =>
            fc.record({
              scope: fc.constant(scope),
              list: fc.constant(list),
              idx: fc.integer({ min: 0, max: list.length - 1 }),
            }),
          ),
        ),
        ({ scope, list, idx }) => {
          const targetId = list[idx].id;
          const old = inScopeRow(scope, targetId);
          const result = realtimeReducer(list, { type: "DELETE", old }, scope);

          // El id afectado desaparece; los demás permanecen (referencia y orden).
          const expected = list.filter((d) => d.id !== targetId);
          expect(result).toHaveLength(expected.length);
          expect(sameByReference(result, expected)).toBe(true);
          expect(result.some((d) => d.id === targetId)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("evento fuera de scope: la lista permanece sin cambios (misma referencia) (100+ iteraciones)", () => {
    fc.assert(
      fc.property(
        scopeArb.chain((scope) =>
          fc.record({
            scope: fc.constant(scope),
            list: listArb(scope),
            type: eventTypeArb,
            outFields: outOfScopeFieldsArb(scope),
            id: fc.uuid(),
          }),
        ),
        ({ scope, list, type, outFields, id }) => {
          const foreignRow = { id, ...outFields, referencia: "ajeno" };
          const event =
            type === "DELETE"
              ? { type, old: foreignRow }
              : { type, new: foreignRow };

          const result = realtimeReducer(list, event, scope);

          // Fuera de scope ⇒ se devuelve la misma referencia, sin mutaciones.
          expect(result).toBe(list);
        },
      ),
      { numRuns: 100 },
    );
  });
});
