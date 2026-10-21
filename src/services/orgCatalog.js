// Catálogo organizacional: países (tenants), compañías y almacenes (bodegas).
// Fuente de verdad: tablas org_* en Supabase (ver supabase/migrations/20261021_org_catalog.sql).
// - Lectura: directo con la anon key (las tablas son de solo lectura para clientes).
// - Escritura: Cloud Function `orgCatalogAdmin`, que valida role = dev en servidor.
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { supabase } from "../supabase";

function mapTenant(r) {
  return { id: r.id, name: r.name, active: r.active, updatedAt: r.updated_at, updatedBy: r.updated_by };
}

function mapCompany(r) {
  return { id: r.id, name: r.name, active: r.active, updatedAt: r.updated_at, updatedBy: r.updated_by };
}

function mapBodega(r) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    name: r.name,
    sroWarehouseId: r.sro_warehouse_id,
    active: r.active,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

/** Lee el catálogo completo (incluye inactivos). */
export async function fetchOrgCatalog() {
  const [tenants, companies, bodegas] = await Promise.all([
    supabase.from("org_tenants").select("*").order("id"),
    supabase.from("org_companies").select("*").order("id"),
    supabase.from("org_bodegas").select("*").order("tenant_id").order("company_id").order("name"),
  ]);
  const failed = [tenants, companies, bodegas].find((r) => r.error);
  if (failed) {
    const msg = failed.error?.message || "Error desconocido";
    if (/relation .* does not exist|schema cache/i.test(msg)) {
      throw new Error(
        "Las tablas del catálogo todavía no existen en Supabase. Hay que correr la migración 20261021_org_catalog.sql."
      );
    }
    throw new Error(`No se pudo leer el catálogo: ${msg}`);
  }
  return {
    tenants: tenants.data.map(mapTenant),
    companies: companies.data.map(mapCompany),
    bodegas: bodegas.data.map(mapBodega),
  };
}

const orgCatalogAdmin = httpsCallable(functions, "orgCatalogAdmin");

/**
 * Crea o edita un registro del catálogo (solo dev).
 * @param {"tenant"|"company"|"bodega"} entity
 * @param {"create"|"update"} action
 * @param {object} data
 */
export async function saveOrgCatalog(entity, action, data) {
  try {
    const res = await orgCatalogAdmin({ entity, action, data });
    return res.data?.record || null;
  } catch (e) {
    // HttpsError trae el mensaje en español armado por la función.
    throw new Error(e?.message || "No se pudo guardar.");
  }
}
