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

/* --------------------------------------------------------------- artículos */

export async function listPalletArticulos({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  let q = scope(supabase.from("pallet_articulos").select("*")).order("codigo", {
    ascending: true,
  });
  if (!includeInactive) q = q.eq("active", true);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Previsualiza el próximo código (A####) sin crear nada. La RPC sigue siendo
// la autoridad al guardar; esto es solo para mostrarlo en el formulario.
export async function getNextArticuloCode() {
  const { data, error } = await scope(
    supabase.from("pallet_articulos").select("codigo")
  );
  if (error) throw error;
  let max = -1;
  for (const r of data || []) {
    const m = /^A(\d+)$/.exec(r.codigo || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return "A" + String(max + 1).padStart(4, "0");
}

// El código (A####) se genera en la RPC; aquí solo se manda nombre + almacén.
export async function createPalletArticulo({ nombre, warehouseId }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El nombre del artículo es obligatorio.");
  if (!warehouseId) throw new Error("Debe seleccionar un almacén.");
  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_create_articulo", {
    p_tenant_id: tenantId,
    p_company: company,
    p_warehouse_id: warehouseId,
    p_nombre: clean,
  });
  if (error) throw error;
  return data; // fila completa del artículo (incluye codigo)
}

export async function setPalletArticuloActive(id, active) {
  const { data, error } = await supabase
    .from("pallet_articulos")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
