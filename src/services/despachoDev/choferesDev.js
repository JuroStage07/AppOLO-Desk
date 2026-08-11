// Boletas de salida — servicio de choferes (catálogo despacho_dev_choferes).
//
// A diferencia de las boletas (escritura solo por RPC), los choferes se
// leen/escriben directo con el cliente de Supabase, protegidos por RLS de
// scope. Alimenta el autocompletado por cédula del formulario de boleta manual.
//
// El scope { tenantId, company, bodegaId } se pasa explícitamente desde la UI
// (AuthCtx), igual que el resto del proyecto (no se usa Supabase Auth).

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

function normalizarCedula(cedula) {
  return String(cedula || "").replace(/\s+/g, "").trim();
}

/** Busca un chofer por cédula dentro del scope. Devuelve la fila o null. */
export async function buscarChoferPorCedula(scope, cedula) {
  const { tenantId, company } = assertScope(scope);
  const clean = normalizarCedula(cedula);
  if (!clean) return null;

  const { data, error } = await supabase
    .from("despacho_dev_choferes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company", company)
    .eq("cedula", clean)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function buildChoferPayload(scope, data) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  return {
    tenant_id: tenantId,
    company,
    bodega_id: bodegaId,
    nombre: String(data.nombre || "").trim(),
    cedula: normalizarCedula(data.cedula),
    compania: String(data.compania || "").trim() || null,
    placa_camion: String(data.placaCamion || "").trim() || null,
    placa_contenedor: String(data.placaContenedor || "").trim() || null,
    tipo_vehiculo: data.tipoVehiculo || null,
    celular: String(data.celular || "").trim() || null,
    cedula_foto_path: data.cedulaFotoPath || null,
  };
}

/** Crea un chofer. Devuelve la fila creada. */
export async function crearChofer(scope, data) {
  const payload = buildChoferPayload(scope, data);
  if (!payload.nombre) throw new Error("El nombre del chofer es obligatorio.");
  if (!payload.cedula) throw new Error("La cédula del chofer es obligatoria.");

  const { data: row, error } = await supabase
    .from("despacho_dev_choferes")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return row;
}

/** Actualiza un chofer existente por id. Devuelve la fila actualizada. */
export async function actualizarChofer(scope, id, data) {
  const { tenantId, company } = assertScope(scope);
  if (!id) throw new Error("Falta el identificador del chofer.");
  const payload = buildChoferPayload(scope, data);

  const { data: row, error } = await supabase
    .from("despacho_dev_choferes")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("company", company)
    .select("*")
    .single();

  if (error) throw error;
  return row;
}

/**
 * Crea o actualiza según exista un chofer con esa cédula en el scope.
 * Devuelve la fila resultante.
 */
export async function upsertChoferPorCedula(scope, data) {
  const existente = await buscarChoferPorCedula(scope, data.cedula);
  if (existente) {
    return actualizarChofer(scope, existente.id, data);
  }
  return crearChofer(scope, data);
}

/**
 * Sube la foto de la cédula al bucket privado y devuelve su ruta (storage path).
 * Ruta: {tenant}/{company}/{bodega}/choferes/{cedula|uuid}-{ts}.{ext}
 */
export async function subirFotoCedula(scope, file, cedula) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!file) throw new Error("No se seleccionó ningún archivo.");

  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const base = normalizarCedula(cedula) || crypto.randomUUID();
  const path = `${tenantId}/${company}/${bodegaId}/choferes/${base}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (error) throw error;
  return path;
}

/** Devuelve una signed URL temporal para leer un objeto privado del bucket. */
export async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}
