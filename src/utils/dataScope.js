export function normalizeScopeValue(value) {
  return String(value || "").trim();
}

/**
 * Scope activo del usuario: tenant + company + bodega.
 * `bodegaId`/`bodegaNombre` vienen de profiles/{uid} (tercera identidad, igual que en AppOLO).
 */
export function buildUserScope(profileOrScope) {
  const p = profileOrScope || {};
  return {
    tenantId: normalizeScopeValue(p.tenantId),
    company: normalizeScopeValue(p.company),
    bodegaId: normalizeScopeValue(p.bodegaId),
    bodegaNombre: normalizeScopeValue(p.bodegaNombre),
  };
}

/**
 * Campos de scope para ESCRITURAS (addDoc/setDoc/updateDoc).
 * Siempre incluye tenantId/company; añade bodegaId/bodegaNombre solo si hay bodega activa,
 * para no ensuciar documentos cuando el perfil aún no tiene bodega asignada.
 */
export function buildScopeFields(profileOrScope) {
  const { tenantId, company, bodegaId, bodegaNombre } = buildUserScope(profileOrScope);
  const out = {};
  if (tenantId) out.tenantId = tenantId;
  if (company) out.company = company;
  if (bodegaId) {
    out.bodegaId = bodegaId;
    out.bodegaNombre = bodegaNombre || "";
  }
  return out;
}

/**
 * Regla de pertenencia por scope completo (tenant + company + bodega).
 * Compatibilidad legacy:
 *   - Si no hay scope activo (todo vacío), no filtramos.
 *   - tenant/company: si el user tiene el valor y no coincide con el doc → fuera.
 *   - bodega: si el doc NO trae bodegaId (legacy) o el user no tiene bodega activa → se permite;
 *     solo se descarta cuando AMBOS existen y no coinciden.
 */
export function sameTenantScope(data, scope) {
  const s = buildUserScope(scope);
  if (!s.tenantId && !s.company && !s.bodegaId) return true;

  const tRow = normalizeScopeValue(data?.tenantId);
  const cRow = normalizeScopeValue(data?.company);
  const bRow = normalizeScopeValue(data?.bodegaId);

  if (s.tenantId && tRow !== s.tenantId) return false;
  if (s.company && cRow !== s.company) return false;
  // Compatibilidad legacy: doc sin bodega o user sin bodega activa → pasa.
  if (s.bodegaId && bRow && bRow !== s.bodegaId) return false;
  return true;
}

/**
 * Returns true only when the record belongs to the same tenant/company/bodega scope.
 * If user scope is missing, we keep backwards compatibility and allow the row.
 *
 * `bodegaId` es opcional: si no se pasa, se comporta como el scope tenant/company original.
 */
export function isInUserScope(record, tenantId, company, bodegaId) {
  return sameTenantScope(record, { tenantId, company, bodegaId });
}

export function filterByUserScope(rows, tenantId, company, bodegaId) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isInUserScope(row, tenantId, company, bodegaId));
}

/**
 * solicitudesOT: si el documento no trae tenantId/company (p. ej. create acotado por
 * keys().hasOnly en reglas), no filtramos por tenant en cliente; Firestore ya exige canMantenimientoOT().
 */
export function isSolicitudOtInScope(record, tenantId, company, bodegaId) {
  const tRow = normalizeScopeValue(record?.tenantId);
  const cRow = normalizeScopeValue(record?.company);
  if (!tRow && !cRow) return true;
  return isInUserScope(record, tenantId, company, bodegaId);
}

export function filterSolicitudesOtByScope(rows, tenantId, company, bodegaId) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isSolicitudOtInScope(row, tenantId, company, bodegaId));
}

/**
 * equipos: documentos sin tenantId/company (legacy o creados antes del acotado) se muestran
 * igual; si traen ámbito, debe coincidir con el perfil.
 */
export function isEquipoInScope(record, tenantId, company, bodegaId) {
  const tRow = normalizeScopeValue(record?.tenantId);
  const cRow = normalizeScopeValue(record?.company);
  if (!tRow && !cRow) return true;
  return isInUserScope(record, tenantId, company, bodegaId);
}

export function filterEquiposByScope(rows, tenantId, company, bodegaId) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isEquipoInScope(row, tenantId, company, bodegaId));
}
