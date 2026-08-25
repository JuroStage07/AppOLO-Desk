// Boletas de salida — servicio de boletas (tabla despacho_dev_boletas).
//
// Usa el cliente AUTENTICADO `supabaseDespachoDev` (sesión de Supabase Auth del
// área de Desarrollo). El aislamiento multi-tenant lo impone RLS con el scope
// del JWT (tenant_id/company/bodega_id); por eso las lecturas NO llevan filtros
// de scope explícitos y las escrituras van por RPCs SECURITY DEFINER que toman
// el scope y el autor del JWT server-side.

import { supabaseDespachoDev } from "../supabaseDespachoDev";
import { FOTOS_BUCKET } from "./constants";

function client() {
  if (!supabaseDespachoDev) {
    throw new Error("Supabase no está configurado (área de Desarrollo).");
  }
  return supabaseDespachoDev;
}

function assertScope(scope) {
  const tenantId = scope?.tenantId || null;
  const company = scope?.company || null;
  const bodegaId = scope?.bodegaId || null;
  if (!tenantId || !company || !bodegaId) {
    throw new Error("La sesión de Supabase no tiene scope (tenant/company/bodega).");
  }
  return { tenantId, company, bodegaId };
}

/**
 * Genera una boleta manual (sin despacho de origen). El scope y el autor los
 * resuelve la RPC desde el JWT.
 * @returns {Promise<string>} boletaId (uuid)
 */
export async function generarBoletaManual(payload) {
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

  const { data, error } = await client().rpc("dd_generar_boleta_manual", { p_payload });
  if (error) throw error;
  return data;
}

/** Valida una boleta: checklist completo en "sí" + firma (PNG en storage). */
export async function validarBoleta({ boletaId, checklist, firmaPath }) {
  if (!boletaId) throw new Error("Falta el identificador de la boleta.");
  const { data, error } = await client().rpc("dd_validar_boleta", {
    p_boleta_id: boletaId,
    p_checklist: checklist || {},
    p_firma_path: firmaPath || "",
  });
  if (error) throw error;
  return data;
}

/** Rechaza una boleta con un motivo (>= 10 caracteres). */
export async function rechazarBoleta({ boletaId, motivo }) {
  if (!boletaId) throw new Error("Falta el identificador de la boleta.");
  const { data, error } = await client().rpc("dd_rechazar_boleta", {
    p_boleta_id: boletaId,
    p_motivo: String(motivo || "").trim(),
  });
  if (error) throw error;
  return data;
}

/** Obtiene una boleta por id. RLS la limita al scope del JWT. */
export async function obtenerBoleta(boletaId) {
  if (!boletaId) return null;
  const { data, error } = await client()
    .from("despacho_dev_boletas")
    .select("*")
    .eq("id", boletaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Lista boletas del scope (RLS por JWT). Filtros opcionales: estado, origen,
 * texto (número, chofer, cédula, placa), dateFrom, dateTo, limit.
 */
export async function listarBoletas(filters = {}) {
  const { estado, origen, texto, dateFrom, dateTo, limit = 200 } = filters;

  let q = client()
    .from("despacho_dev_boletas")
    .select("*")
    .is("deleted_at", null);

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
 * Sube la firma (PNG) al bucket privado y devuelve su ruta. El prefijo de la
 * ruta ({tenant}/{company}/{bodega}) debe coincidir con el scope del JWT para
 * pasar la RLS de storage.objects.
 */
export async function subirFirma(scope, boletaId, blob) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!blob) throw new Error("No hay firma para subir.");
  const id = boletaId || crypto.randomUUID();
  const path = `${tenantId}/${company}/${bodegaId}/firmas/${id}-${Date.now()}.png`;

  const { error } = await client()
    .storage.from(FOTOS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (error) throw error;
  return path;
}

/** Signed URL temporal para leer objetos privados (firma / cédula). */
export async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await client()
    .storage.from(FOTOS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}
