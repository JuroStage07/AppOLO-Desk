// MRP Tarimas — servicios de movimientos: ajustes, traslados, historial y descartes.
//
// La lógica transaccional (mutar stock + escribir historial de forma atómica,
// validar stock suficiente, impedir inventario negativo) vive en funciones RPC
// de Postgres (`mrp_positive_adjustment`, `mrp_negative_adjustment`,
// `mrp_transfer`) — ver supabase/mrp_pallets.sql. Aquí hacemos validación rápida
// de UX y delegamos la atomicidad a la base de datos.
//
// REGLA: el ajuste negativo se registra en `pallet_discards` (registro
// administrativo) y descuenta stock de la ubicación origen (por defecto `pend`).
// NUNCA envía tarimas a `merma` ni crea stock operativo.

import { supabase } from "../../supabase";
import {
  isValidPalletType,
  isValidLocation,
  requiresStore,
  INTAKE_LOCATION,
} from "./constants";
import { getMrpScope } from "./scope";

function assertCommon({ quantity, brandId, palletType, warehouseId, reason }, { needReason }) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0)
    throw new Error("La cantidad debe ser mayor a 0.");
  if (!Number.isInteger(qty))
    throw new Error("La cantidad debe ser un número entero.");
  if (!brandId) throw new Error("Debe seleccionar una marca.");
  if (!isValidPalletType(palletType))
    throw new Error("Tipo de tarima inválido.");
  if (!warehouseId) throw new Error("Debe seleccionar un almacén.");
  if (needReason && !String(reason || "").trim())
    throw new Error("El motivo es obligatorio.");
  return qty;
}

/* -------------------------------------------------------- ajuste positivo */

/**
 * Ajuste positivo: ingresa tarimas nuevas a la ubicación `pend` del almacén.
 * Suma al inventario global por marca y registra el movimiento.
 */
export async function createPositivePalletAdjustment({
  warehouseId,
  brandId,
  palletType,
  quantity,
  reason,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, brandId, palletType, warehouseId, reason },
    { needReason: true }
  );
  if (!userId) throw new Error("Usuario no identificado.");

  const { data, error } = await supabase.rpc("mrp_positive_adjustment", {
    p_tenant_id: getMrpScope().tenantId,
    p_company: getMrpScope().company,
    p_warehouse_id: warehouseId,
    p_brand_id: brandId,
    p_pallet_type: palletType,
    p_quantity: qty,
    p_reason: String(reason).trim(),
    p_user_id: userId,
    p_user_email: userEmail || null,
  });
  if (error) throw error;
  return data; // { movement_id, movement_code, intake_location: 'pend' }
}

/* -------------------------------------------------------- ajuste negativo */

/**
 * Ajuste negativo (descarte): registra en `pallet_discards`, crea movimiento
 * `ajuste_negativo` y descuenta del inventario en `originLocation`.
 *
 * Lógica de origen (acordada):
 *   - Por defecto descuenta de `pend` del almacén seleccionado.
 *   - Si no hay suficiente en `pend`, el llamador puede pasar `originLocation`
 *     para descartar desde otra ubicación operativa.
 *   - La RPC impide inventario negativo (lanza error si no hay stock suficiente).
 *
 * NUNCA toca `merma` como destino ni crea stock operativo.
 */
export async function createNegativePalletAdjustment({
  warehouseId,
  brandId,
  palletType,
  quantity,
  reason,
  originLocation = INTAKE_LOCATION,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, brandId, palletType, warehouseId, reason },
    { needReason: true }
  );
  if (!isValidLocation(originLocation))
    throw new Error("Ubicación origen inválida.");
  if (requiresStore(originLocation))
    throw new Error("El descarte no puede tener origen en una tienda.");
  if (!userId) throw new Error("Usuario no identificado.");

  const { data, error } = await supabase.rpc("mrp_negative_adjustment", {
    p_tenant_id: getMrpScope().tenantId,
    p_company: getMrpScope().company,
    p_warehouse_id: warehouseId,
    p_brand_id: brandId,
    p_pallet_type: palletType,
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

/**
 * Traslado de tarimas entre ubicaciones del mismo almacén.
 * Valida stock suficiente en origen, descuenta de origen y suma a destino,
 * de forma atómica. Genera task_id y movement_code.
 */
export async function transferPallets({
  warehouseId,
  originLocation,
  destinationLocation,
  originStoreId = null,
  destinationStoreId = null,
  brandId,
  palletType,
  quantity,
  reason,
  userId,
  userEmail,
}) {
  const qty = assertCommon(
    { quantity, brandId, palletType, warehouseId, reason },
    { needReason: false }
  );
  if (!isValidLocation(originLocation))
    throw new Error("Ubicación origen inválida.");
  if (!isValidLocation(destinationLocation))
    throw new Error("Ubicación destino inválida.");
  if (originLocation === destinationLocation && originStoreId === destinationStoreId)
    throw new Error("El origen y el destino no pueden ser iguales.");
  if (requiresStore(originLocation) && !originStoreId)
    throw new Error("Debe seleccionar la tienda origen.");
  if (requiresStore(destinationLocation) && !destinationStoreId)
    throw new Error("Debe seleccionar la tienda destino.");
  if (!userId) throw new Error("Usuario no identificado.");

  const { data, error } = await supabase.rpc("mrp_transfer", {
    p_tenant_id: getMrpScope().tenantId,
    p_company: getMrpScope().company,
    p_warehouse_id: warehouseId,
    p_origin_location: originLocation,
    p_destination_location: destinationLocation,
    p_origin_store_id: requiresStore(originLocation) ? originStoreId : null,
    p_destination_store_id: requiresStore(destinationLocation)
      ? destinationStoreId
      : null,
    p_brand_id: brandId,
    p_pallet_type: palletType,
    p_quantity: qty,
    p_reason: reason ? String(reason).trim() : null,
    p_user_id: userId,
    p_user_email: userEmail || null,
  });
  if (error) throw error;
  return data; // { movement_id, movement_code, task_id }
}

/* ----------------------------------------------------- historial / descartes */

/**
 * Historial de movimientos con filtros opcionales.
 * Filtros: movementCode, taskId, userId, brandId, palletType,
 *          movementType, originLocation, destinationLocation,
 *          dateFrom, dateTo (ISO), reason (texto), warehouseId.
 */
export async function listPalletMovements(filters = {}) {
  let q = supabase
    .from("pallet_movements")
    .select(
      `id, movement_code, task_id, warehouse_id, movement_type,
       origin_location, destination_location, origin_store_id, destination_store_id,
       brand_id, pallet_type, quantity, reason, user_id, user_email, metadata, created_at,
       brand:pallet_brands(name),
       warehouse:pallet_warehouses(name),
       origin_store:pallet_stores!pallet_movements_origin_store_id_fkey(store_number, name),
       destination_store:pallet_stores!pallet_movements_destination_store_id_fkey(store_number, name)`
    )
    .eq("tenant_id", getMrpScope().tenantId)
    .eq("company", getMrpScope().company);

  const {
    movementCode,
    taskId,
    userId,
    userEmail,
    brandId,
    palletType,
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
  if (brandId) q = q.eq("brand_id", brandId);
  if (palletType) q = q.eq("pallet_type", palletType);
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

/**
 * Lista los descartes (ajustes negativos) con filtros opcionales.
 * Filtros: brandId, palletType, warehouseId, dateFrom, dateTo, userId, reason.
 */
export async function listPalletDiscards(filters = {}) {
  let q = supabase
    .from("pallet_discards")
    .select(
      `id, movement_id, warehouse_id, brand_id, pallet_type, quantity, reason,
       user_id, user_email, created_at,
       brand:pallet_brands(name),
       warehouse:pallet_warehouses(name),
       movement:pallet_movements(movement_code, origin_location)`
    )
    .eq("tenant_id", getMrpScope().tenantId)
    .eq("company", getMrpScope().company);

  const {
    brandId,
    palletType,
    warehouseId,
    userId,
    userEmail,
    reason,
    dateFrom,
    dateTo,
    limit = 500,
  } = filters;

  if (brandId) q = q.eq("brand_id", brandId);
  if (palletType) q = q.eq("pallet_type", palletType);
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
