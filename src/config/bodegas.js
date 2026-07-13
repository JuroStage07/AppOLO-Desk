/**
 * Catálogo de bodegas por país y compañía.
 *
 * IDs siguen el patrón  <tenantId>-<company>-<CLAVE>  (todo mayúsculas, sin espacios).
 * El primer elemento de cada scope es el default que usa `resolveDefaultBodega`.
 *
 * tenantId y company deben coincidir con los valores aceptados en firestore.rules:
 *   tenantId  ∈  ['CR', 'VNZ']
 *   company   === 'OLO'
 *
 * `warehouseId` mapea la bodega al warehouse del sistema SRO (Supabase). Se usa para
 * filtrar reservas por bodega en Tareas de Apertura. Si una bodega no tiene warehouse
 * SRO asociado, dejar `warehouseId: null`.
 */

export const DEFAULT_COMPANY = "OLO";

export const TENANT_OPTIONS = [
  { id: "CR",  label: "Costa Rica" },
  { id: "VNZ", label: "Venezuela"  },
];

export const COMPANY_OPTIONS = [
  { id: DEFAULT_COMPANY, label: DEFAULT_COMPANY },
];

/** @type {Array<{ id: string, label: string, tenantId: string, company: string, warehouseId: string|null }>} */
export const BODEGA_OPTIONS = [
  // ── Costa Rica ────────────────────────────────────────────────────────────
  {
    id: "CR-OLO-CLIRO",
    label: "CLIRO",
    tenantId: "CR",
    company: DEFAULT_COMPANY,
    warehouseId: "9d0ed657-f928-4d6d-a4c4-524483c14038",
  },
  {
    id: "CR-OLO-ELCOCO",
    label: "El Coco",
    tenantId: "CR",
    company: DEFAULT_COMPANY,
    warehouseId: "5026e93b-821a-4ff8-9c95-dcd1246b9729",
  },

  // ── Venezuela ─────────────────────────────────────────────────────────────
  {
    id: "VNZ-OLO-SANDIEGO",
    label: "San Diego",
    tenantId: "VNZ",
    company: DEFAULT_COMPANY,
    warehouseId: "0cd760c5-7d31-4f9e-b45c-17138e9ad8b4",
  },
  {
    id: "VNZ-OLO-MICHELENA",
    label: "Michelena",
    tenantId: "VNZ",
    company: DEFAULT_COMPANY,
    warehouseId: "b821c165-fc15-4ddc-b553-0c6a704dc4cf",
  },
];

/**
 * Devuelve todas las bodegas de un scope (tenantId + company).
 * @param {string} tenantId
 * @param {string} [company]
 * @returns {Array<{ id: string, label: string, tenantId: string, company: string }>}
 */
export function getBodegasForScope(tenantId, company = DEFAULT_COMPANY) {
  return BODEGA_OPTIONS.filter(
    (b) => b.tenantId === tenantId && b.company === company
  );
}

/**
 * Busca una bodega por su ID exacto.
 * @param {string|null|undefined} bodegaId
 * @returns {{ id: string, label: string, tenantId: string, company: string, warehouseId: string|null } | null}
 */
export function getBodegaById(bodegaId) {
  const cleanId = String(bodegaId || "").trim();
  if (!cleanId) return null;
  return BODEGA_OPTIONS.find((b) => b.id === cleanId) || null;
}

/**
 * Devuelve el warehouseId (SRO) asociado a una bodega, o null si no tiene.
 * Se usa para filtrar reservas SRO por la bodega activa en Tareas de Apertura.
 * @param {string|null|undefined} bodegaId
 * @returns {string|null}
 */
export function getWarehouseIdForBodega(bodegaId) {
  const bodega = getBodegaById(bodegaId);
  return bodega?.warehouseId || null;
}

/**
 * Devuelve la bodega por defecto de un scope (el primer elemento del array).
 * @param {string} tenantId
 * @param {string} [company]
 * @returns {{ id: string, label: string, tenantId: string, company: string } | null}
 */
export function resolveDefaultBodega(tenantId, company = DEFAULT_COMPANY) {
  const bodegas = getBodegasForScope(tenantId, company);
  return bodegas[0] || null;
}

/**
 * Devuelve el label de una bodega dado su ID.
 * Si el ID no se encuentra en el catálogo, devuelve el ID mismo como fallback legible.
 * @param {string|null|undefined} bodegaId
 * @returns {string}
 */
export function getBodegaLabel(bodegaId) {
  const bodega = getBodegaById(bodegaId);
  return bodega?.label || String(bodegaId || "").trim() || "";
}

/**
 * Normaliza una selección de bodega a partir de los valores raw del perfil o del formulario.
 * - Si `bodegaId` apunta a una bodega válida dentro del scope, la usa.
 * - Si no, cae al primer elemento del scope (default).
 * - Devuelve siempre { tenantId, company, bodegaId, bodegaNombre }.
 *
 * @param {{ tenantId?: string, company?: string, bodegaId?: string, bodegaNombre?: string }} opts
 * @returns {{ tenantId: string, company: string, bodegaId: string|null, bodegaNombre: string|null }}
 */
export function normalizeBodegaSelection({ tenantId, company, bodegaId, bodegaNombre }) {
  const cleanTenantId  = String(tenantId  || "").trim();
  const cleanCompany   = String(company   || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;

  const explicit = getBodegaById(bodegaId);
  const scopedExplicit =
    explicit?.tenantId === cleanTenantId && explicit?.company === cleanCompany
      ? explicit
      : null;

  const fallback = resolveDefaultBodega(cleanTenantId, cleanCompany);
  const selected = scopedExplicit || fallback;

  return {
    tenantId:     cleanTenantId,
    company:      cleanCompany,
    bodegaId:     selected?.id    || String(bodegaId    || "").trim() || null,
    bodegaNombre: selected?.label || String(bodegaNombre || "").trim() || String(bodegaId || "").trim() || null,
  };
}
