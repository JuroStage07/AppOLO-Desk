// MRP Tarimas — servicios de catálogos: marcas, tiendas y almacenes.
//
// Scoping: toda escritura/lectura va fijada a tenant_id = "CR" / company = "OLO".
// Seguridad por usuario no es autoritativa en el servidor (anon key + auth Firebase):
// el gating de permisos vive en el cliente (route guard + permiso `mrpTarimas`).

import { supabase } from "../../supabase";
import { getMrpScope } from "./scope";

const scope = (q) => {
  const { tenantId, company } = getMrpScope();
  return q.eq("tenant_id", tenantId).eq("company", company);
};

// Columnas de scope para inserts (tenant/company del usuario logeado).
const scopeFields = () => {
  const { tenantId, company } = getMrpScope();
  return { tenant_id: tenantId, company };
};

// Traduce el error de violación de unicidad de Postgres (23505) a un mensaje claro.
function mapDuplicate(error, friendly) {
  if (error?.code === "23505") return new Error(friendly);
  return error;
}

/* ------------------------------------------------------------------ marcas */

export async function listPalletBrands({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  let q = scope(
    supabase
      .from("pallet_brands")
      .select("*, warehouse:pallet_warehouses(id, name, code)")
  ).order("name", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createPalletBrand({ name, warehouseId }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("El nombre de la marca es obligatorio.");
  if (!warehouseId) throw new Error("Debe seleccionar un almacén.");
  const { data, error } = await supabase
    .from("pallet_brands")
    .insert({
      ...scopeFields(),
      warehouse_id: warehouseId,
      name: clean,
      active: true,
    })
    .select()
    .single();
  if (error)
    throw mapDuplicate(error, "Ya existe una marca con ese nombre en el almacén.");
  return data;
}

export async function setPalletBrandActive(id, active) {
  const { data, error } = await supabase
    .from("pallet_brands")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------------- tiendas */

export async function listPalletStores({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  let q = scope(
    supabase
      .from("pallet_stores")
      .select("*, warehouse:pallet_warehouses(id, name, code)")
  ).order("store_number", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createPalletStore({ storeNumber, name, warehouseId }) {
  const num = String(storeNumber ?? "").trim();
  const clean = String(name || "").trim();
  if (!num) throw new Error("El número de tienda es obligatorio.");
  if (!clean) throw new Error("El nombre de la tienda es obligatorio.");
  if (!warehouseId) throw new Error("Debe seleccionar un almacén.");
  const { data, error } = await supabase
    .from("pallet_stores")
    .insert({
      ...scopeFields(),
      warehouse_id: warehouseId,
      store_number: num,
      name: clean,
      active: true,
    })
    .select()
    .single();
  if (error)
    throw mapDuplicate(error, "Ya existe una tienda con ese número en el almacén.");
  return data;
}

export async function setPalletStoreActive(id, active) {
  const { data, error } = await supabase
    .from("pallet_stores")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* --------------------------------------------------------------- almacenes */

export async function listPalletWarehouses({ includeInactive = false } = {}) {
  let q = scope(supabase.from("pallet_warehouses").select("*")).order("name", {
    ascending: true,
  });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createPalletWarehouse({ name, code }) {
  const clean = String(name || "").trim();
  const cleanCode = String(code || "").trim();
  if (!clean) throw new Error("El nombre del almacén es obligatorio.");
  const { data, error } = await supabase
    .from("pallet_warehouses")
    .insert({
      ...scopeFields(),
      name: clean,
      code: cleanCode || null,
      active: true,
    })
    .select()
    .single();
  if (error) throw mapDuplicate(error, "Ya existe un almacén con ese nombre.");
  return data;
}

export async function setPalletWarehouseActive(id, active) {
  const { data, error } = await supabase
    .from("pallet_warehouses")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
