// Feature: despachos-dev, Property 21: Filtrado por scope completo (tenant + company + bodega)
//
// Para toda colección de filas con valores de scope variados y todo
// Scope_Usuario, el conjunto visible contiene únicamente filas cuyos
// `tenant_id`, `company` y `bodega_id` coinciden con los tres valores del
// scope del usuario.
//
// Validates: Requirements 9.1

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isRowInScope, filterRowsByScope } from "./scopeFilter.js";
import { normalizeScopeValue } from "../../../../utils/dataScope.js";

// Pool pequeño de valores para cada campo de scope, de modo que las filas
// generadas produzcan tanto coincidencias como discrepancias frente al scope.
// Incluye variantes con espacios para ejercitar la normalización (trim/String)
// que usa el módulo, más strings numéricos que serán convertidos por String().
const TENANT_POOL = ["CR", "VNZ", " CR ", "MX"];
const COMPANY_POOL = ["OLO", "ACME", " OLO ", "COFERSA"];
const BODEGA_POOL = ["b1", "b2", " b1 ", "b3"];

const scopeValueArb = (pool) =>
  fc.oneof(
    fc.constantFrom(...pool),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(""),
    fc.integer({ min: 1, max: 3 }), // ejercita String() sobre no-strings
  );

// Fila con forma snake_case de Supabase; campos de scope de un pool acotado.
const rowArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  tenant_id: scopeValueArb(TENANT_POOL),
  company: scopeValueArb(COMPANY_POOL),
  bodega_id: scopeValueArb(BODEGA_POOL),
});

const rowsArb = fc.array(rowArb, { maxLength: 30 });

// Scope del usuario en forma camelCase, como lo entrega AuthCtx.
const scopeArb = fc.record({
  tenantId: fc.constantFrom(...TENANT_POOL),
  company: fc.constantFrom(...COMPANY_POOL),
  bodegaId: fc.constantFrom(...BODEGA_POOL),
});

// Coincidencia esperada: los tres campos normalizados (trim/String) igualan a
// los tres valores del scope, también normalizados. Replica exactamente la
// regla del módulo bajo prueba.
function matchesScopeExpected(row, scope) {
  return (
    normalizeScopeValue(row.tenant_id) === normalizeScopeValue(scope.tenantId) &&
    normalizeScopeValue(row.company) === normalizeScopeValue(scope.company) &&
    normalizeScopeValue(row.bodega_id) === normalizeScopeValue(scope.bodegaId)
  );
}

describe("filterRowsByScope — filtrado por scope completo (Property 21)", () => {
  it("devuelve únicamente filas cuyos tenant/company/bodega coinciden con el scope", () => {
    fc.assert(
      fc.property(rowsArb, scopeArb, (rows, scope) => {
        const visibles = filterRowsByScope(rows, scope);

        // El conjunto visible es exactamente el esperado por la regla de scope.
        const esperado = rows.filter((row) => matchesScopeExpected(row, scope));
        expect(visibles).toEqual(esperado);

        // Toda fila visible está en scope (coincide en los tres campos).
        for (const row of visibles) {
          expect(isRowInScope(row, scope)).toBe(true);
          expect(matchesScopeExpected(row, scope)).toBe(true);
        }

        // Toda fila excluida difiere en al menos uno de los tres campos.
        const excluidas = rows.filter((row) => !visibles.includes(row));
        for (const row of excluidas) {
          const difiere =
            normalizeScopeValue(row.tenant_id) !== normalizeScopeValue(scope.tenantId) ||
            normalizeScopeValue(row.company) !== normalizeScopeValue(scope.company) ||
            normalizeScopeValue(row.bodega_id) !== normalizeScopeValue(scope.bodegaId);
          expect(difiere).toBe(true);
          expect(isRowInScope(row, scope)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
