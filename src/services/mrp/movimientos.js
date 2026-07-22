// MRP Tarimas — servicios de movimientos por ARTÍCULO: ajustes, traslados,
// historial y descartes.
//
// La lógica transaccional (mutar stock + historial atómicos, validar stock,
// impedir inventario negativo, mantener el total del artículo) vive en RPCs de
// Postgres (mrp_articulo_ajuste_positivo / _negativo / mrp_articulo_transfer).
//
// REGLA: el ajuste negativo se registra en `pallet_descartes_articulo` y
// descuenta de la ubicación origen (default `pend`). NUNCA toca `merma` como
// destino ni crea stock operativo.

import { supabase } from "../../supabase";
import { getMrpScope } from "./scope";
import { isValidLocation, INTAKE_LOCATION } from "./constants";

function assertCommon({ quantity, articuloId, warehouseId, reason }, { needReason }) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0)
    throw new Error("La cantidad debe ser mayor a 0.");
  if (!Number.isInteger(qty))
    throw new Error("La cantidad debe ser un número entero.");
  if (!articuloId) throw new Error("Debe seleccionar un artículo.");
  if (!warehouseId) throw new Error("Debe seleccionar un almacén.");
  if (needReason && !String(reason || "").trim())
    throw new Error("El motivo es obligatorio.");
  return qty;
}

/* -------------------------------------------------------- ajuste positivo */

export async function createPositivePalletAdjustment({
  warehouseId,
  articuloId,
  quantity,
  reason,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, articuloId, warehouseId, reason },
    { needReason: true }
  );
  if (!userId) throw new Error("Usuario no identificado.");

  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_articulo_ajuste_positivo", {
    p_tenant_id: tenantId,
    p_company: company,
    p_warehouse_id: warehouseId,
    p_articulo_id: articuloId,
    p_quantity: qty,
    p_reason: String(reason).trim(),
    p_user_id: userId,
    p_user_email: userEmail || null,
  });
  if (error) throw error;
  return data; // { movement_id, movement_code, intake_location: 'pend' }
}

/* -------------------------------------------------------- ajuste negativo */

export async function createNegativePalletAdjustment({
  warehouseId,
  articuloId,
  quantity,
  reason,
  originLocation = INTAKE_LOCATION,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, articuloId, warehouseId, reason },
    { needReason: true }
  );
  if (!isValidLocation(originLocation))
    throw new Error("Ubicación origen inválida.");
  if (originLocation === "tienda")
    throw new Error("El descarte no puede tener origen en una tienda.");
  if (!userId) throw new Error("Usuario no identificado.");

  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_articulo_ajuste_negativo", {
    p_tenant_id: tenantId,
    p_company: company,
    p_warehouse_id: warehouseId,
    p_articulo_id: articuloId,
    p_quantity: qty,
    p_reason: String(reason).trim(),
    p_origin_location: originLocation,
    p_user_id: userId,
    p_user_email: userEmail || null,
  });
  if (error) throw error;
  return data; // { movement_id, movement_code, discard_id }
}

/* --------------------------------------------------------------- traslado */

export async function transferPallets({
  warehouseId,
  originLocation,
  destinationLocation,
  articuloId,
  quantity,
  reason,
  tiendaId = null,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, articuloId, warehouseId, reason },
    { needReason: false }
  );
  if (!isValidLocation(originLocation))
    throw new Error("Ubicación origen inválida.");
  if (!isValidLocation(destinationLocation))
    throw new Error("Ubicación destino inválida.");
  if (originLocation === destinationLocation)
    throw new Error("El origen y el destino no pueden ser iguales.");
  // Cuando el destino es una tienda, la tienda destino es obligatoria (UI).
  if (destinationLocation === "tienda" && !tiendaId)
    throw new Error("Debe seleccionar la tienda destino.");
  if (!userId) throw new Error("Usuario no identificado.");

  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_articulo_transfer", {
    p_tenant_id: tenantId,
    p_company: company,
    p_warehouse_id: warehouseId,
    p_origin_location: originLocation,
    p_destination_location: destinationLocation,
    p_articulo_id: articuloId,
    p_quantity: qty,
    p_reason: reason ? String(reason).trim() : null,
    p_user_id: userId,
    p_user_email: userEmail || null,
    p_tienda_id: destinationLocation === "tienda" ? tiendaId : null,
  });
  if (error) throw error;
  return data; // { movement_id, movement_code, task_id }
}

/* --------------------------------------------- traslado ENTRE ALMACENES */

// Traslada una cantidad de un artículo del almacén de trabajo (origen) a otro
// almacén del mismo tenant/company. El artículo destino se resuelve por nombre y
// se auto-crea si no existe (código nuevo). Registra un evento en cada almacén.
export async function transferPalletsBetweenWarehouses({
  originWarehouseId,
  destWarehouseId,
  articuloId,
  originLocation,
  destinationLocation = INTAKE_LOCATION,
  quantity,
  reason,
  userId,
  userEmail,
}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0)
    throw new Error("La cantidad debe ser mayor a 0.");
  if (!Number.isInteger(qty))
    throw new Error("La cantidad debe ser un número entero.");
  if (!articuloId) throw new Error("Debe seleccionar un artículo.");
  if (!originWarehouseId) throw new Error("Debe indicar el almacén de origen.");
  if (!destWarehouseId) throw new Error("Debe seleccionar el almacén de destino.");
  if (originWarehouseId === destWarehouseId)
    throw new Error("El almacén de origen y destino no pueden ser iguales.");
  if (!isValidLocation(originLocation) || originLocation === "tienda")
    throw new Error("Ubicación origen inválida.");
  if (!isValidLocation(destinationLocation) || destinationLocation === "tienda")
    throw new Error("Ubicación destino inválida.");
  if (!userId) throw new Error("Usuario no identificado.");

  const { tenantId, company } = getMrpScope();
  const { data, error } = await supabase.rpc("mrp_articulo_warehouse_transfer", {
    p_tenant_id: tenantId,
    p_company: company,
    p_origin_warehouse_id: originWarehouseId,
    p_dest_warehouse_id: destWarehouseId,
    p_articulo_id: articuloId,
    p_origin_location: originLocation,
    p_dest_location: destinationLocation,
    p_quantity: qty,
    p_reason: reason ? String(reason).trim() : null,
    p_user_id: userId,
    p_user_email: userEmail || null,
  });
  if (error) throw error;
  return data; // { task_id, out_movement_code, in_movement_code, dest_articulo_id, dest_created }
}

/* ----------------------------------------------------- historial / descartes */

export async function listPalletMovements(filters = {}) {
  const { tenantId, company } = getMrpScope();
  let q = supabase
    .from("pallet_movimientos_articulo")
    .select(
      `id, movement_code, task_id, warehouse_id, movement_type,
       origin_location, destination_location,
       articulo_id, quantity, reason, user_id, user_email, metadata, created_at,
       articulo:pallet_articulos(codigo, nombre),
       warehouse:pallet_warehouses(name)`
    )
    .eq("tenant_id", tenantId)
    .eq("company", company);

  const {
    movementCode,
    taskId,
    userId,
    userEmail,
    articuloId,
    movementType,
    originLocation,
    destinationLocation,
    warehouseId,
    reason,
    dateFrom,
    dateTo,
    limit = 500,
  } = filters;

  if (movementCode) q = q.eq("movement_code", movementCode);
  if (taskId) q = q.eq("task_id", taskId);
  if (userId) q = q.eq("user_id", userId);
  if (userEmail) q = q.ilike("user_email", `%${userEmail}%`);
  if (articuloId) q = q.eq("articulo_id", articuloId);
  if (movementType) q = q.eq("movement_type", movementType);
  if (originLocation) q = q.eq("origin_location", originLocation);
  if (destinationLocation) q = q.eq("destination_location", destinationLocation);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (reason) q = q.ilike("reason", `%${reason}%`);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function listPalletDiscards(filters = {}) {
  const { tenantId, company } = getMrpScope();
  let q = supabase
    .from("pallet_descartes_articulo")
    .select(
      `id, movement_id, warehouse_id, articulo_id, quantity, reason,
       user_id, user_email, created_at,
       articulo:pallet_articulos(codigo, nombre),
       warehouse:pallet_warehouses(name),
       movement:pallet_movimientos_articulo(movement_code, origin_location)`
    )
    .eq("tenant_id", tenantId)
    .eq("company", company);

  const {
    articuloId,
    warehouseId,
    userId,
    userEmail,
    reason,
    dateFrom,
    dateTo,
    limit = 500,
  } = filters;

  if (articuloId) q = q.eq("articulo_id", articuloId);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  if (userId) q = q.eq("user_id", userId);
  if (userEmail) q = q.ilike("user_email", `%${userEmail}%`);
  if (reason) q = q.ilike("reason", `%${reason}%`);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
