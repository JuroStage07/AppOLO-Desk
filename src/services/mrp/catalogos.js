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

/* ------------------------------------------- vínculo bodega ↔ almacén (MRP) */

// Lista almacenes de TODOS los tenants (sin filtro de scope) para configurar los
// vínculos bodega→almacén. La RLS de Supabase debe permitir company='OLO'
// (ver supabase/mrp_pallets_bodega_link.sql).
export async function listAllPalletWarehouses({ includeInactive = false } = {}) {
  let q = supabase
    .from("pallet_warehouses")
    .select("id, tenant_id, company, name, code, active, bodega_id")
    .order("tenant_id", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Resuelve el almacén ligado a una bodega (para el workspace del MRP).
export async function getWarehouseByBodega(bodegaId) {
  const clean = String(bodegaId || "").trim();
  if (!clean) return null;
  const { data, error } = await supabase
    .from("pallet_warehouses")
    .select("id, tenant_id, company, name, code, active, bodega_id")
    .eq("bodega_id", clean)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Liga una bodega a un almacén (relación 1:1). Libera la bodega de cualquier otro
// almacén que la tuviera antes para respetar el índice único de bodega_id.
export async function setWarehouseBodega(warehouseId, bodegaId) {
  if (!warehouseId) throw new Error("Debe indicar el almacén.");
  const clean = String(bodegaId || "").trim();
  if (!clean) throw new Error("Debe indicar la bodega.");

  const { error: freeErr } = await supabase
    .from("pallet_warehouses")
    .update({ bodega_id: null })
    .eq("bodega_id", clean)
    .neq("id", warehouseId);
  if (freeErr) throw freeErr;

  const { data, error } = await supabase
    .from("pallet_warehouses")
    .update({ bodega_id: clean })
    .eq("id", warehouseId)
    .select("id, tenant_id, company, name, code, active, bodega_id")
    .single();
  if (error) throw error;
  return data;
}

// Busca un artículo activo por NOMBRE (case-insensitive, con trim) dentro de un
// almacén. Se usa para avisar antes de auto-crearlo en un traslado entre almacenes
// (misma lógica de emparejamiento que la RPC mrp_articulo_warehouse_transfer).
export async function findArticuloByNombre(warehouseId, nombre) {
  const clean = String(nombre || "").trim();
  if (!warehouseId || !clean) return null;
  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase
    .from("pallet_articulos")
    .select("id, codigo, nombre")
    .eq("tenant_id", tenantId)
    .eq("company", company)
    .eq("warehouse_id", warehouseId)
    .eq("active", true)
    .ilike("nombre", `%${clean}%`);
  if (error) throw error;
  const target = clean.toLowerCase();
  return (
    (data || []).find(
      (a) => String(a.nombre || "").trim().toLowerCase() === target
    ) || null
  );
}

// Desliga una bodega (deja sin almacén al que la tuviera).
export async function unlinkBodega(bodegaId) {
  const clean = String(bodegaId || "").trim();
  if (!clean) return;
  const { error } = await supabase
    .from("pallet_warehouses")
    .update({ bodega_id: null })
    .eq("bodega_id", clean);
  if (error) throw error;
}

/* ----------------------------------------------------------------- motivos */

// Motivos por tipo de movimiento. Se usan en los modales de Ajuste/Traslado y se
// administran en /dev/config-modulos/mrp-tarimas/motivos.
export async function listMotivos({ tipo, includeInactive = false } = {}) {
  let q = scope(supabase.from("pallet_motivos").select("*"));
  if (tipo) q = q.eq("tipo", tipo);
  if (!includeInactive) q = q.eq("active", true);
  q = q
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createMotivo({ tipo, label }) {
  const cleanTipo = String(tipo || "").trim();
  const cleanLabel = String(label || "").trim();
  if (!cleanTipo) throw new Error("Tipo de motivo inválido.");
  if (!cleanLabel) throw new Error("El motivo no puede estar vacío.");
  const { data, error } = await supabase
    .from("pallet_motivos")
    .insert({ ...scopeFields(), tipo: cleanTipo, label: cleanLabel, active: true })
    .select()
    .single();
  if (error) throw mapDuplicate(error, "Ya existe ese motivo para este tipo.");
  return data;
}

export async function setMotivoActive(id, active) {
  const { data, error } = await supabase
    .from("pallet_motivos")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMotivo(id) {
  const { error } = await supabase.from("pallet_motivos").delete().eq("id", id);
  if (error) throw error;
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

/* ------------------------------------------------------- insumos (Insumos) */
// Los insumos se fijan solo por tenant/company (no dependen de un almacén).

export async function listInsumos({ includeInactive = false } = {}) {
  let q = scope(supabase.from("mrp_insumos").select("*")).order("codigo", {
    ascending: true,
  });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Previsualiza el próximo código (AI###) sin crear nada. La RPC es la
// autoridad al guardar; esto solo alimenta el formulario.
export async function getNextInsumoCode() {
  const { data, error } = await scope(
    supabase.from("mrp_insumos").select("codigo")
  );
  if (error) throw error;
  let max = 0;
  for (const r of data || []) {
    const m = /^AI(\d+)$/.exec(r.codigo || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return "AI" + String(max + 1).padStart(3, "0");
}

// El código (AI###) se genera en la RPC; aquí solo se validan y envían campos.
export async function createInsumo({ nombre, detalle, price, priceMode }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El nombre del insumo es obligatorio.");
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    throw new Error("El precio debe ser un número mayor o igual a 0.");
  }
  const mode = priceMode === "batch" ? "batch" : "unit";
  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_create_insumo", {
    p_tenant_id: tenantId,
    p_company: company,
    p_nombre: clean,
    p_detalle: String(detalle || "").trim() || null,
    p_price: p,
    p_price_mode: mode,
  });
  if (error) throw error;
  return data; // fila completa del insumo (incluye codigo)
}

export async function setInsumoActive(id, active) {
  const { data, error } = await supabase
    .from("mrp_insumos")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Edición de insumo. El código NO se edita. Valida nombre, precio y stock.
export async function updateInsumo(id, { nombre, detalle, price, priceMode, stock }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El nombre del insumo es obligatorio.");
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    throw new Error("El precio debe ser un número mayor o igual a 0.");
  }
  const s = Number(stock);
  if (!Number.isInteger(s) || s < 0) {
    throw new Error("El stock debe ser un entero mayor o igual a 0.");
  }
  const mode = priceMode === "batch" ? "batch" : "unit";
  const { data, error } = await scope(
    supabase
      .from("mrp_insumos")
      .update({
        nombre: clean,
        detalle: String(detalle || "").trim() || null,
        price: p,
        price_mode: mode,
        stock: s,
      })
      .eq("id", id)
  )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Borra un insumo. Si está referenciado por un BOM, Postgres lanza 23503
// (violación de FK); lo traducimos a un mensaje claro en español.
export async function deleteInsumo(id) {
  const { error } = await scope(
    supabase.from("mrp_insumos").delete().eq("id", id)
  );
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: el insumo está en uso por uno o más BOM."
      );
    }
    throw error;
  }
}

/* ------------------------------------------------------------- BOM (BOM) */
// Un BOM (Bill of Materials) es la composición de materiales que consume
// insumos. Se fija solo por tenant/company (no depende de un almacén).

export async function listMrpBoms({ includeInactive = false } = {}) {
  let q = scope(
    supabase
      .from("mrp_boms")
      .select(
        "*, items:mrp_bom_insumos(position, quantity, insumo:mrp_insumos(id, codigo, nombre, price, price_mode, active))"
      )
  ).order("codigo", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  // Aplana los insumos de cada BOM (ordenados por `position`), añadiendo la
  // cantidad requerida a cada uno.
  return (data || []).map((r) => ({
    ...r,
    insumos: (r.items || [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .filter((it) => it.insumo)
      .map((it) => ({ ...it.insumo, quantity: it.quantity })),
  }));
}

// Previsualiza el próximo código (BOM###) sin crear nada. La RPC es la
// autoridad al guardar; esto solo alimenta el formulario.
export async function getNextBomCode() {
  const { data, error } = await scope(
    supabase.from("mrp_boms").select("codigo")
  );
  if (error) throw error;
  let max = 0;
  for (const r of data || []) {
    const m = /^BOM(\d+)$/.exec(r.codigo || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return "BOM" + String(max + 1).padStart(3, "0");
}

// Normaliza `items` ([{ insumoId, quantity }]) al formato jsonb de la RPC
// ([{ insumo_id, quantity }]) validando las cantidades.
function buildBomItems(items) {
  const list = Array.isArray(items) ? items : [];
  const payload = [];
  for (const it of list) {
    const insumoId = it?.insumoId || it?.insumo_id;
    const qty = Number(it?.quantity);
    if (!insumoId) continue;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("Cada insumo debe tener una cantidad entera mayor a 0.");
    }
    payload.push({ insumo_id: insumoId, quantity: qty });
  }
  if (!payload.length) {
    throw new Error("Debe seleccionar al menos un artículo insumo.");
  }
  return payload;
}

// El código (BOM###) se genera en la RPC, que crea el BOM + filas de unión
// (con cantidades) transaccionalmente. `items`: [{ insumoId, quantity }].
export async function createMrpBom({ nombre, items }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El nombre del BOM es obligatorio.");
  const payload = buildBomItems(items);
  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_create_bom", {
    p_tenant_id: tenantId,
    p_company: company,
    p_nombre: clean,
    p_items: payload,
  });
  if (error) throw error;
  return data; // fila del BOM (incluye codigo, insumo_count)
}

// Edición de BOM: actualiza nombre + reemplaza insumos (con cantidades)
// transaccionalmente vía RPC. El código NO se edita.
export async function updateMrpBom(id, { nombre, items }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El nombre del BOM es obligatorio.");
  const payload = buildBomItems(items);
  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_update_bom", {
    p_tenant_id: tenantId,
    p_company: company,
    p_bom_id: id,
    p_nombre: clean,
    p_items: payload,
  });
  if (error) throw error;
  return data;
}

// Borra un BOM. Sus filas de unión se eliminan por `on delete cascade`.
export async function deleteMrpBom(id) {
  const { error } = await scope(
    supabase.from("mrp_boms").delete().eq("id", id)
  );
  if (error) throw error;
}

export async function setMrpBomActive(id, active) {
  const { data, error } = await supabase
    .from("mrp_boms")
    .update({ active: !!active })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
