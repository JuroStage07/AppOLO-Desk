// Fotos firmadas para SRO (Proceso 3D). Común a despachos y, cuando las
// recepciones estén en Supabase (etapa B), a recepciones.
//
// Reglas (contrato v1, fotos a pedido):
//   - Solo rutas registradas en la tabla de fotos (despacho_dev_fotos); nunca se
//     lista el bucket. El bucket despacho-dev-fotos también guarda cédulas
//     (…/choferes/…) y firmas de boletas (…/boletas/…): esas nunca se firman.
//   - Cada ruta debe empezar por {tenant}/{company}/{bodega}/{dueño}/ (dueño =
//     despacho o recepción) y no contener /choferes/ ni /boletas/.
//   - URLs firmadas https, 3600 s. Con transformación de imágenes se firman a
//     ~1280 px de ancho (las originales pesan ~2,3 MB); sin ella, el original en lote.
//   - Si la firma falla se devuelve [] (quien llama responde 200 sin fotos).

export const FOTOS_EXPIRA_S = 3600;
export const FOTOS_MAX = 60;
export const FOTOS_ANCHO = 1280;

export type FilaFoto = {
  storage_path: string;
  taken_at?: string | null;
  created_at?: string | null;
  tarima?: string | null;
};

export type FotoFirmada = { url: string; taken_at: string | null; tarima: "S" | "D" | null };

export type Alcance = { tenant: string; company: string; bodega: string; dueñoId: string };

/** ¿La ruta es una foto de ese despacho/recepción y no una cédula o firma? */
export function rutaFotoSegura(path: unknown, a: Alcance): boolean {
  const p = String(path ?? "");
  if (!p || p.includes("..")) return false;
  if (/\/(choferes|boletas)\//i.test(`/${p}`)) return false;
  if (!a.tenant || !a.company || !a.bodega || !a.dueñoId) return false;
  return p.startsWith(`${a.tenant}/${a.company}/${a.bodega}/${a.dueñoId}/`);
}

/** Filas seguras, más recientes primero, como mucho `max`. */
export function seleccionarFotos(filas: FilaFoto[], a: Alcance, max = FOTOS_MAX): FilaFoto[] {
  const fecha = (f: FilaFoto) => String(f.taken_at ?? f.created_at ?? "");
  return (filas || [])
    .filter((f) => rutaFotoSegura(f.storage_path, a))
    .sort((x, y) => fecha(y).localeCompare(fecha(x)))
    .slice(0, max);
}

/** Interfaz mínima del cliente de Storage (supabase-js) para poder probarlo. */
export type StorageBucket = {
  createSignedUrl(
    path: string,
    expiresIn: number,
    opts?: { transform?: { width?: number; quality?: number } }
  ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUrls(
    paths: string[],
    expiresIn: number
  ): Promise<{ data: Array<{ path: string | null; signedUrl: string | null; error?: string | null }> | null; error: unknown }>;
};

const tarimaDe = (t: unknown): "S" | "D" | null => (t === "S" || t === "D" ? t : null);
const esHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);

/**
 * Firma las fotos (ya seleccionadas). Nunca lanza: ante cualquier error devuelve
 * lo que se pudo firmar, o [] si falló todo.
 */
export async function firmarFotos(
  bucket: StorageBucket,
  filas: FilaFoto[],
  { ancho = FOTOS_ANCHO, expiraS = FOTOS_EXPIRA_S }: { ancho?: number | null; expiraS?: number } = {}
): Promise<FotoFirmada[]> {
  if (!filas.length) return [];
  try {
    if (ancho) {
      const res = await Promise.all(
        filas.map((f) =>
          bucket
            .createSignedUrl(f.storage_path, expiraS, { transform: { width: ancho, quality: 75 } })
            .catch((error) => ({ data: null, error }))
        )
      );
      return filas.flatMap((f, i) => {
        const url = res[i]?.data?.signedUrl;
        return !res[i]?.error && esHttps(url) ? [{ url, taken_at: f.taken_at ?? null, tarima: tarimaDe(f.tarima) }] : [];
      });
    }
    const { data, error } = await bucket.createSignedUrls(filas.map((f) => f.storage_path), expiraS);
    if (error || !Array.isArray(data)) return [];
    const porRuta = new Map(data.filter((d) => !d.error && esHttps(d.signedUrl)).map((d) => [d.path, d.signedUrl as string]));
    return filas.flatMap((f) => {
      const url = porRuta.get(f.storage_path);
      return url ? [{ url, taken_at: f.taken_at ?? null, tarima: tarimaDe(f.tarima) }] : [];
    });
  } catch {
    return [];
  }
}

/** Datos que necesita `fotosDeDespacho` (inyectados para poder probarlo). */
export type FuenteFotosDespacho = {
  /** Despacho por id, solo si es de esa bodega y no está borrado/eliminado. */
  despacho(despachoId: string, bodegaId: string): Promise<{ tenant_id: string; company: string; bodega_id: string } | null>;
  fotos(despachoId: string, limite: number): Promise<FilaFoto[]>;
  bucket: StorageBucket;
};

/**
 * Fotos a pedido de un despacho. 404 si el despacho no es de la bodega del
 * almacén pedido (evita pedir fotos de otra bodega cambiando el id).
 */
export async function fotosDeDespacho(
  fuente: FuenteFotosDespacho,
  despachoId: string,
  bodegaId: string,
  opts: { ancho?: number | null } = {}
): Promise<{ status: 200; body: { despacho_id: string; fotos: FotoFirmada[] } } | { status: 404; body: { error: string } }> {
  const d = await fuente.despacho(despachoId, bodegaId);
  if (!d || d.bodega_id !== bodegaId) return { status: 404, body: { error: "Despacho no encontrado en esta bodega." } };
  const alcance = { tenant: d.tenant_id, company: d.company, bodega: d.bodega_id, dueñoId: despachoId };
  let filas: FilaFoto[] = [];
  try {
    filas = await fuente.fotos(despachoId, FOTOS_MAX);
  } catch {
    filas = [];
  }
  const fotos = await firmarFotos(fuente.bucket, seleccionarFotos(filas, alcance), opts);
  return { status: 200, body: { despacho_id: despachoId, fotos } };
}
