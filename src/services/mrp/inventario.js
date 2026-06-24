// MRP Tarimas — servicios de inventario (lecturas y resúmenes).
//
// El inventario vive en `pallet_inventory`, una fila por combinación
// (almacén, ubicación, marca, tipo, tienda?). El total GLOBAL por marca es la
// suma de TODAS las ubicaciones operativas, incluida `merma`. Los descartes NO
// son inventario, por lo que quedan excluidos del global por construcción.

import { supabase } from "../../supabase";
import { getMrpScope } from "./scope";

const scope = (q) => {
  const { tenantId, company } = getMrpScope();
  return q.eq("tenant_id", tenantId).eq("company", company);
};

/**
 * Lista filas de inventario con joins a marca/almacén/tienda.
 * Filtros opcionales: warehouseId, location, brandId, palletType, storeId.
 * Por defecto omite filas en cero (onlyWithStock = true).
 */
export async function listPalletInventory({
  warehouseId,
  location,
  brandId,
  palletType,
  storeId,
  onlyWithStock = true,
} = {}) {
  let q = scope(
    supabase.from("pallet_inventory").select(
      `id, warehouse_id, location, store_id, brand_id, pallet_type, quantity, updated_at,
       brand:pallet_brands(id, name),
       warehouse:pallet_warehouses(id, name, code),
       store:pallet_stores(id, store_number, name)`
    )
  );

  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (location) q = q.eq("location", location);
  if (brandId) q = q.eq("brand_id", brandId);
  if (palletType) q = q.eq("pallet_type", palletType);
  if (storeId) q = q.eq("store_id", storeId);
  if (onlyWithStock) q = q.gt("quantity", 0);

  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Resumen GLOBAL por marca: total de tarimas por marca sumando todas las
 * ubicaciones operativas (incluye merma; excluye descartes).
 * Filtros opcionales: brandId, palletType.
 * Devuelve [{ brand_id, brand_name, pallet_type|null, total }].
 */
export async function getPalletSummaryByBrand({ brandId, palletType } = {}) {
  let q = scope(
    supabase
      .from("pallet_inventory")
      .select("brand_id, pallet_type, quantity, brand:pallet_brands(name)")
  ).gt("quantity", 0);
  if (brandId) q = q.eq("brand_id", brandId);
  if (palletType) q = q.eq("pallet_type", palletType);

  const { data, error } = await q;
  if (error) throw error;

  // Agregación en memoria: total por marca (global, todas las ubicaciones y tipos).
  const map = new Map();
  for (const row of data || []) {
    const key = row.brand_id;
    const prev = map.get(key) || {
      brand_id: row.brand_id,
      brand_name: row.brand?.name || "",
      pallet_type: palletType || null,
      total: 0,
    };
    prev.total += Number(row.quantity) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.brand_name.localeCompare(b.brand_name)
  );
}

/**
 * Resumen por ubicación (opcionalmente por marca). Útil para ver cómo se
 * reparte el stock entre tienda/almacen/patio/reparacion/merma/pend.
 * Devuelve [{ location, total }] o, si byBrand, [{ location, brand_id, brand_name, total }].
 */
export async function getPalletSummaryByLocation({
  brandId,
  warehouseId,
  byBrand = false,
} = {}) {
  let q = scope(
    supabase
      .from("pallet_inventory")
      .select("location, brand_id, quantity, brand:pallet_brands(name)")
  ).gt("quantity", 0);
  if (brandId) q = q.eq("brand_id", brandId);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);

  const { data, error } = await q;
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = byBrand ? `${row.location}__${row.brand_id}` : row.location;
    const prev = map.get(key) || {
      location: row.location,
      ...(byBrand
        ? { brand_id: row.brand_id, brand_name: row.brand?.name || "" }
        : {}),
      total: 0,
    };
    prev.total += Number(row.quantity) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values());
}
