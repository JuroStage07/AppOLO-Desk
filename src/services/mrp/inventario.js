// MRP Tarimas — servicios de inventario por ARTÍCULO (lecturas y resúmenes).
//
// El inventario vive en `pallet_inventory_articulo`, una fila por combinación
// (almacén, ubicación, artículo, tienda?). El total GLOBAL por artículo es la
// suma de TODAS las ubicaciones operativas, incluida `merma`. Los descartes NO
// son inventario y quedan excluidos por construcción.

import { supabase } from "../../supabase";
import { getMrpScope } from "./scope";

const scope = (q) => {
  const { tenantId, company } = getMrpScope();
  return q.eq("tenant_id", tenantId).eq("company", company);
};

/**
 * Lista filas de inventario por artículo con joins a artículo/almacén/tienda.
 * Filtros opcionales: warehouseId, location, articuloId, storeId.
 */
export async function listPalletInventory({
  warehouseId,
  location,
  articuloId,
  storeId = null,
  onlyWithStock = true,
} = {}) {
  let q = scope(
    supabase.from("pallet_inventory_articulo").select(
      `id, warehouse_id, location, articulo_id, quantity, store_id, updated_at,
       articulo:pallet_articulos(id, codigo, nombre),
       warehouse:pallet_warehouses(id, name, code),
       tienda:pallet_tiendas(id, codigo, nombre)`
    )
  );

  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (location) q = q.eq("location", location);
  if (articuloId) q = q.eq("articulo_id", articuloId);
  if (storeId) q = q.eq("store_id", storeId);
  if (onlyWithStock) q = q.gt("quantity", 0);

  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Resumen GLOBAL por artículo: total sumando todas las ubicaciones operativas
 * (incluye merma; excluye descartes).
 * Devuelve [{ articulo_id, codigo, nombre, total }].
 */
export async function getPalletSummaryByArticulo({ warehouseId, articuloId } = {}) {
  let q = scope(
    supabase
      .from("pallet_inventory_articulo")
      .select("articulo_id, quantity, articulo:pallet_articulos(codigo, nombre)")
  ).gt("quantity", 0);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (articuloId) q = q.eq("articulo_id", articuloId);

  const { data, error } = await q;
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const prev = map.get(row.articulo_id) || {
      articulo_id: row.articulo_id,
      codigo: row.articulo?.codigo || "",
      nombre: row.articulo?.nombre || "",
      total: 0,
    };
    prev.total += Number(row.quantity) || 0;
    map.set(row.articulo_id, prev);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.codigo.localeCompare(b.codigo)
  );
}

/**
 * Resumen por ubicación (opcionalmente por artículo).
 * Devuelve [{ location, total }].
 */
export async function getPalletSummaryByLocation({ warehouseId, articuloId } = {}) {
  let q = scope(
    supabase.from("pallet_inventory_articulo").select("location, quantity")
  ).gt("quantity", 0);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (articuloId) q = q.eq("articulo_id", articuloId);

  const { data, error } = await q;
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    map.set(row.location, (map.get(row.location) || 0) + (Number(row.quantity) || 0));
  }
  return Array.from(map, ([location, total]) => ({ location, total }));
}
