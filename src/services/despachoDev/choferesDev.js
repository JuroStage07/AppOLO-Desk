// Boletas de salida — servicio de choferes (catálogo despacho_dev_choferes).
//
// Usa el cliente AUTENTICADO `supabaseDespachoDev`. A diferencia de las boletas
// (escritura solo por RPC), los choferes se leen/escriben directo, protegidos
// por RLS de scope (JWT). En las escrituras se sellan tenant_id/company/bodega_id
// con el scope de la sesión para pasar la política `with check`.

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

function normalizarCedula(cedula) {
  return String(cedula || "").replace(/\s+/g, "").trim();
}

// PostgREST reporta columnas inexistentes con este texto. Lo usamos para
// descartar campos que la tabla real no tiene (el esquema de choferes puede
// variar entre entornos) y reintentar, sin acoplar el código a un esquema fijo.
const UNKNOWN_COLUMN_RE = /Could not find the '([^']+)' column/i;

function unknownColumnFromError(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`;
  const m = UNKNOWN_COLUMN_RE.exec(text);
  return m ? m[1] : null;
}

// Campos mínimos que nunca se descartan (obligatorios para identidad + RLS).
const REQUIRED_CHOFER_KEYS = new Set([
  "tenant_id",
  "company",
  "bodega_id",
  "nombre",
  "cedula",
]);

/**
 * Ejecuta una escritura (insert/update builder factory) descartando de forma
 * incremental las columnas que la tabla no reconoce, hasta que la operación
 * funcione o no queden columnas opcionales que quitar.
 * @param {(payload:object)=>PromiseLike<{data:any,error:any}>} run
 * @param {object} payload
 */
async function writeWithSchemaRetry(run, payload) {
  let current = { ...payload };
  for (let i = 0; i < 12; i += 1) {
    const { data, error } = await run(current);
    if (!error) return data;
    const col = unknownColumnFromError(error);
    if (col && col in current && !REQUIRED_CHOFER_KEYS.has(col)) {
      delete current[col];
      continue;
    }
    throw error;
  }
  throw new Error("No se pudo guardar el chofer: esquema de tabla incompatible.");
}

/** Busca un chofer por cédula (RLS limita al scope del JWT). Fila o null. */
export async function buscarChoferPorCedula(cedula) {
  const clean = normalizarCedula(cedula);
  if (!clean) return null;

  const { data, error } = await client()
    .from("despacho_dev_choferes")
    .select("*")
    .eq("cedula", clean)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function buildChoferPayload(scope, data) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  // Columnas reales de despacho_dev_choferes: nombre, cedula, placa_camion,
  // compania, tipo_vehiculo, celular, cedula_foto_path (+ scope). La placa de
  // contenedor NO vive en el chofer (fue eliminada en la migración 019); es
  // dato de la boleta (furgón).
  return {
    tenant_id: tenantId,
    company,
    bodega_id: bodegaId,
    nombre: String(data.nombre || "").trim(),
    cedula: normalizarCedula(data.cedula),
    compania: String(data.compania || "").trim() || null,
    placa_camion: String(data.placaCamion || "").trim() || null,
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

  return writeWithSchemaRetry(
    (p) => client().from("despacho_dev_choferes").insert(p).select("*").single(),
    payload
  );
}

/** Actualiza un chofer existente por id. Devuelve la fila actualizada. */
export async function actualizarChofer(scope, id, data) {
  if (!id) throw new Error("Falta el identificador del chofer.");
  const payload = buildChoferPayload(scope, data);

  return writeWithSchemaRetry(
    (p) =>
      client()
        .from("despacho_dev_choferes")
        .update(p)
        .eq("id", id)
        .select("*")
        .single(),
    payload
  );
}

/**
 * Crea o actualiza según exista un chofer con esa cédula en el scope.
 * Devuelve la fila resultante.
 */
export async function upsertChoferPorCedula(scope, data) {
  const existente = await buscarChoferPorCedula(data.cedula);
  if (existente) {
    return actualizarChofer(scope, existente.id, data);
  }
  return crearChofer(scope, data);
}

/**
 * Sube la foto de la cédula al bucket privado y devuelve su ruta. El prefijo
 * ({tenant}/{company}/{bodega}) debe coincidir con el scope del JWT para pasar
 * la RLS de storage.objects.
 */
export async function subirFotoCedula(scope, file, cedula) {
  const { tenantId, company, bodegaId } = assertScope(scope);
  if (!file) throw new Error("No se seleccionó ningún archivo.");

  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const base = normalizarCedula(cedula) || crypto.randomUUID();
  const path = `${tenantId}/${company}/${bodegaId}/choferes/${base}-${Date.now()}.${ext}`;

  const { error } = await client()
    .storage.from(FOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (error) throw error;
  return path;
}

/** Devuelve una signed URL temporal para leer un objeto privado del bucket. */
export async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await client()
    .storage.from(FOTOS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}
