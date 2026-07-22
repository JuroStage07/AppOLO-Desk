// MRP Tarimas — Registro de eventos (bitácora de auditoría de catálogos).
//
// `logEvento` es best-effort: sella scope (tenant/company) + usuario actual y
// NUNCA rompe la mutación principal si el insert falla. `listEventos` lee la
// bitácora con filtros básicos.
import { supabase } from "../../supabase";
import { getMrpScope, getMrpUser } from "./scope";
import { bumpRefresh } from "../../hooks/mrp/refreshBus";

export async function logEvento({
  entityType,
  entityId = null,
  codigo = null,
  nombre = null,
  action,
  detail = null,
}) {
  try {
    const { tenantId, company } = getMrpScope();
    const { userId, userEmail } = getMrpUser();
    const { error } = await supabase.from("mrp_eventos").insert({
      tenant_id: tenantId,
      company,
      entity_type: entityType,
      entity_id: entityId,
      entity_codigo: codigo,
      entity_nombre: nombre,
      action,
      detail,
      user_id: userId,
      user_email: userEmail,
    });
    if (error) throw error;
    bumpRefresh("eventos");
  } catch (e) {
    // No romper la operación principal por un fallo de bitácora.
    console.warn("logEvento falló:", e?.message || e);
  }
}

export async function listEventos(filters = {}) {
  const { tenantId, company } = getMrpScope();
  let q = supabase
    .from("mrp_eventos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company", company);

  const { entityType, action, dateFrom, dateTo, limit = 500 } = filters;
  if (entityType) q = q.eq("entity_type", entityType);
  if (action) q = q.eq("action", action);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
