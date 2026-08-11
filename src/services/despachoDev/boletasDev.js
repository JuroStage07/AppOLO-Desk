// Boletas de salida — servicio de boletas (tabla despacho_dev_boletas).
//
// Regla de oro: los clientes NO hacen INSERT/UPDATE sobre boletas. Solo SELECT
// (RLS por scope). Toda escritura pasa por RPCs SECURITY DEFINER
// (dd_generar_boleta_manual / dd_validar_boleta / dd_rechazar_boleta), a las
// que se les pasa el scope como parámetros explícitos (patrón del repo, sin
// Supabase Auth).

import { supabase } from "../../supabase";
import { FOTOS_BUCKET } from "./constants";

function assertScope(scope) {
  const tenantId = scope?.tenantId || null;
  const company = scope?.company || null;
  const bodegaId = scope?.bodegaId || null;
  if (!tenantId || !company || !bodegaId) {
    throw new Error("Scope incompleto: falta tenant, company o bodega activa.");
  }
  return { tenantId, company, bodegaId };
}

/**
 * Genera una boleta manual (sin despacho de origen).
 * @param {object} scope { tenantId, company, bodegaId }
 * @param {string} createdBy identificador del autor (email/uid)
 * @param {object} payload ver GenerarBoletaModal
 * @returns {Promise<{boletaId:string, numero:number, numeroFormateado:string, estado:string}>}
 */
export async function generarBoletaManual(scope, createdBy, payload) {
  const { tenantId, company, bodegaId } = assertScope(scope);

  const p_payload = {
    choferId: payload.choferId || null,
    choferNombre: String(payload.choferNombre || "").trim(),
    choferCedula: String(payload.choferCedula || "").trim(),
    compania: String(payload.compania || "").trim(),
    cedulaFotoPath: payload.cedulaFotoPath || null,
    tipoVehiculo: payload.tipoVehiculo,
    placaCamion: String(payload.placaCamion || "").trim(),
    placaContenedor: String(payload.placaContenedor || "").trim(),
    marchamo: String(payload.marchamo || "").trim(),
    cargado: Boolean(payload.cargado),
    destino: String(payload.destino || "").trim(),
  };

  const { data, error } = await supabase.rpc("dd_generar_boleta_manual", {
    p_tenant_id: tenantId,
    p_company: company,
    p_bodega_id: bodegaId,
    p_created_by: createdBy || null,
    p_payload,
  });

  if (error) throw error;
  return data;
}

/** Valida una boleta: checklist completo en "sí" + firma (PNG en storage). */
export async function validarBoleta(scope, validatedBy, { boletaId, checklist, firmaPath }) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!boletaId) throw new Error("Falta el identificador de la boleta.");

  const { data, error } = await supabase.rpc("dd_validar_boleta", {
    p_tenant_id: tenantId,
    p_company: company,
    p_bodega_id: bodegaId,
    p_boleta_id: boletaId,
    p_checklist: checklist || {},
    p_firma_path: firmaPath || "",
    p_validated_by: validatedBy || null,
  });

  if (error) throw error;
  return data;
}

/** Rechaza una boleta con un motivo (>= 10 caracteres). */
export async function rechazarBoleta(scope, rejectedBy, { boletaId, motivo }) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!boletaId) throw new Error("Falta el identificador de la boleta.");

  const { data, error } = await supabase.rpc("dd_rechazar_boleta", {
    p_tenant_id: tenantId,
    p_company: company,
    p_bodega_id: bodegaId,
    p_boleta_id: boletaId,
    p_motivo: String(motivo || "").trim(),
    p_rejected_by: rejectedBy || null,
  });

  if (error) throw error;
  return data;
}

/** Obtiene una boleta por id dentro del scope. */
export async function obtenerBoleta(scope, boletaId) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!boletaId) return null;

  const { data, error } = await supabase
    .from("despacho_dev_boletas")
    .select("*")
    .eq("id", boletaId)
    .eq("tenant_id", tenantId)
    .eq("company", company)
    .is("deleted_at", null)
    // Misma tolerancia fase-1 que listarBoletas: bodega activa o legacy sin bodega.
    .or(`bodega_id.eq.${bodegaId},bodega_id.is.null`)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Lista boletas del scope. Filtros opcionales: estado, origen, texto (número,
 * chofer, cédula, placa), dateFrom, dateTo, limit.
 */
export async function listarBoletas(scope, filters = {}) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  const { estado, origen, texto, dateFrom, dateTo, limit = 200 } = filters;

  let q = supabase
    .from("despacho_dev_boletas")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company", company)
    .is("deleted_at", null)
    // Compatibilidad fase-1 (igual que sameTenantScope): tenant/company son
    // obligatorios; una boleta con bodega_id debe coincidir con la bodega
    // activa, pero las boletas legacy SIN bodega_id (flujo desde-despacho
    // previo a la migración) se muestran igual.
    .or(`bodega_id.eq.${bodegaId},bodega_id.is.null`);

  if (estado) q = q.eq("estado", estado);
  if (origen) q = q.eq("origen", origen);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);

  const clean = String(texto || "").trim();
  if (clean) {
    const like = `%${clean}%`;
    q = q.or(
      [
        `numero_formateado.ilike.${like}`,
        `chofer_nombre.ilike.${like}`,
        `chofer_cedula.ilike.${like}`,
        `placa_camion.ilike.${like}`,
        `placa_contenedor.ilike.${like}`,
      ].join(",")
    );
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Sube la firma (PNG) al bucket privado y devuelve su ruta.
 * Ruta: {tenant}/{company}/{bodega}/firmas/{boletaId}-{ts}.png
 */
export async function subirFirma(scope, boletaId, blob) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!blob) throw new Error("No hay firma para subir.");
  const id = boletaId || crypto.randomUUID();
  const path = `${tenantId}/${company}/${bodegaId}/firmas/${id}-${Date.now()}.png`;

  const { error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/png" });

  if (error) throw error;
  return path;
}

/** Signed URL temporal para leer objetos privados (firma / cédula). */
export async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}
