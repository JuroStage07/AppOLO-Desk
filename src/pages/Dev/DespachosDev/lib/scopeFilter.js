// Capa de dominio pura para "Despachos Dev": filtrado por scope completo.
//
// Las filas de Supabase usan snake_case (`tenant_id`, `company`, `bodega_id`),
// mientras que `isInUserScope` de `src/utils/dataScope.js` espera la forma
// camelCase (`tenantId`/`company`/`bodegaId`). Este módulo mapea la fila a la
// forma esperada y exige coincidencia estricta de los tres campos de scope,
// reutilizando la regla compartida como defensa en profundidad.
//
// Módulo puro y determinista: no muta sus entradas ni depende de estado
// externo. Se valida mediante la Property 21 del diseño de `despachos-dev`.
//
// _Requirements: 9.1_

import {
  buildUserScope,
  isInUserScope,
  normalizeScopeValue,
} from "../../../../utils/dataScope";

/**
 * @typedef {Object} UserScope
 * @property {string|null} [tenantId]
 * @property {string|null} [company]
 * @property {string|null} [bodegaId]
 */

/**
 * Determina si una fila (snake_case de Supabase) pertenece al scope completo
 * del usuario: `tenant_id`, `company` y `bodega_id` deben coincidir
 * exactamente con `scope.tenantId`, `scope.company` y `scope.bodegaId`.
 *
 * A diferencia de la compatibilidad legacy de `sameTenantScope` (que tolera
 * filas sin `bodega_id`), aquí se exige coincidencia de los tres campos para
 * cumplir la Property 21. Se reutiliza `isInUserScope` sobre la fila ya mapeada
 * a camelCase como verificación adicional (defensa en profundidad).
 *
 * Función pura y determinista; no muta `row` ni `scope`.
 *
 * @param {{ tenant_id?: *, company?: *, bodega_id?: * } | null | undefined} row
 * @param {UserScope | null | undefined} scope
 * @returns {boolean}
 * _Requirements: 9.1_
 */
export function isRowInScope(row, scope) {
  if (!row || typeof row !== "object") return false;

  const s = buildUserScope(scope);
  const rowTenant = normalizeScopeValue(row.tenant_id);
  const rowCompany = normalizeScopeValue(row.company);
  const rowBodega = normalizeScopeValue(row.bodega_id);

  // Property 21: los tres campos de scope deben coincidir exactamente.
  if (rowTenant !== s.tenantId) return false;
  if (rowCompany !== s.company) return false;
  if (rowBodega !== s.bodegaId) return false;

  // Reutiliza la regla compartida con la fila mapeada a la forma camelCase.
  return isInUserScope(
    { tenantId: rowTenant, company: rowCompany, bodegaId: rowBodega },
    s.tenantId,
    s.company,
    s.bodegaId,
  );
}

/**
 * Filtra una colección de filas conservando únicamente las que pertenecen al
 * scope completo del usuario. Devuelve un arreglo nuevo (no muta la entrada).
 *
 * @param {readonly { tenant_id?: *, company?: *, bodega_id?: * }[]} rows
 * @param {UserScope | null | undefined} scope
 * @returns {object[]}
 * _Requirements: 9.1_
 */
export function filterRowsByScope(rows, scope) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isRowInScope(row, scope));
}
