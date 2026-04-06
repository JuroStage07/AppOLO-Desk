export function normalizeScopeValue(value) {
  return String(value || "").trim();
}

/**
 * Returns true only when the record belongs to the same tenant/company scope.
 * If user scope is missing, we keep backwards compatibility and allow the row.
 */
export function isInUserScope(record, tenantId, company) {
  const tUser = normalizeScopeValue(tenantId);
  const cUser = normalizeScopeValue(company);
  if (!tUser && !cUser) return true;

  const tRow = normalizeScopeValue(record?.tenantId);
  const cRow = normalizeScopeValue(record?.company);

  if (tUser && tRow !== tUser) return false;
  if (cUser && cRow !== cUser) return false;
  return true;
}

export function filterByUserScope(rows, tenantId, company) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isInUserScope(row, tenantId, company));
}

/**
 * solicitudesOT: si el documento no trae tenantId/company (p. ej. create acotado por
 * keys().hasOnly en reglas), no filtramos por tenant en cliente; Firestore ya exige canMantenimientoOT().
 */
export function isSolicitudOtInScope(record, tenantId, company) {
  const tRow = normalizeScopeValue(record?.tenantId);
  const cRow = normalizeScopeValue(record?.company);
  if (!tRow && !cRow) return true;
  return isInUserScope(record, tenantId, company);
}

export function filterSolicitudesOtByScope(rows, tenantId, company) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isSolicitudOtInScope(row, tenantId, company));
}
