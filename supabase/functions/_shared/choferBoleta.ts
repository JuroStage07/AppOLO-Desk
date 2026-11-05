// Chofer y boleta de salida de un despacho, a pedido, para SRO (Proceso 3D).
//
// Decisión del usuario (05/11/2026): quien tiene `proceso3d.view` puede consultar el
// chofer registrado (incluida la foto de su cédula y su celular) y la boleta de
// salida (checklist y firma) del despacho que selecciona. Nunca se envía el `pin`.
//
// Reglas:
//   - El despacho debe ser de la bodega del almacén pedido y no estar borrado → si
//     no, 404.
//   - Solo se firman DOS rutas: la `cedula_foto_path` del chofer ligado al
//     despacho y la `firma_path` de su boleta. Nunca se lista el bucket.
//   - Cédula: debe estar en {tenant}/{company}/{bodega}/choferes/{chofer_id}/.
//     Firma: {tenant}/{company}/{bodega}/boletas/{boleta_id}/firma_… (actual) o
//     {tenant}/{company}/{bodega}/firmas/{boleta_id}-… (patrón viejo). Si no
//     cumple, ese campo va en null.
//   - URLs firmadas 3600 s: la cédula a ~1280 px, la firma (PNG) sin transformar.
//     Si la firma de URL falla, la imagen va en null (la respuesta sigue siendo 200).
//   - El bloque `boleta` usa la copia guardada en la boleta (lo que se firmó), no
//     los datos actuales del chofer.

import { FOTOS_ANCHO, FOTOS_EXPIRA_S, transformAncho, type StorageBucket } from "./fotos.ts";

type Alcance = { tenant: string; company: string; bodega: string };

const sinSalto = (p: string) => !!p && !p.includes("..");

/** ¿Es la foto de cédula de ESE chofer, dentro de la bodega? */
export function rutaCedulaSegura(path: unknown, a: Alcance & { choferId: string }): boolean {
  const p = String(path ?? "");
  if (!sinSalto(p) || !a.tenant || !a.company || !a.bodega || !a.choferId) return false;
  return p.startsWith(`${a.tenant}/${a.company}/${a.bodega}/choferes/${a.choferId}/`);
}

/** ¿Es la firma de ESA boleta, dentro de la bodega? (patrón actual o viejo) */
export function rutaFirmaSegura(path: unknown, a: Alcance & { boletaId: string }): boolean {
  const p = String(path ?? "");
  if (!sinSalto(p) || !a.tenant || !a.company || !a.bodega || !a.boletaId) return false;
  const base = `${a.tenant}/${a.company}/${a.bodega}/`;
  return p.startsWith(`${base}boletas/${a.boletaId}/firma_`) || p.startsWith(`${base}firmas/${a.boletaId}-`);
}

/** Firma una sola ruta; null si falla (nunca lanza). */
export async function firmarUna(bucket: StorageBucket, path: string, ancho: number | null): Promise<string | null> {
  try {
    const { data, error } = await bucket.createSignedUrl(
      path,
      FOTOS_EXPIRA_S,
      ancho ? { transform: transformAncho(ancho) } : undefined
    );
    const url = data?.signedUrl;
    return !error && typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** Textos del checklist tal como los muestra la app (ValidarBoletaScreen). */
const TEXTO_CHECKLIST: Record<string, string> = {
  identidad: "¿La identidad del chofer es correcta?",
  placaCamion: "¿La placa del camión es correcta?",
  placaContenedor: "¿La placa del contenedor es correcta?",
  // Boletas manuales de una versión anterior de la app (agosto 2026).
  carga: "Carga",
  documentos: "Documentos",
  marchamo: "Marchamo",
  placas: "Placas",
  vehiculo: "Vehículo",
};
const ORDEN = ["identidad", "placaCamion", "placaContenedor"];

export type ItemChecklist = { item: string; ok: boolean | null };

/** checklist JSON de la boleta → [{ item, ok }]. "si" → true, "no" → false. */
export function checklistAItems(checklist: unknown): ItemChecklist[] {
  if (!checklist || typeof checklist !== "object" || Array.isArray(checklist)) return [];
  const c = checklist as Record<string, unknown>;
  if (typeof c.regularizacion === "string") {
    return [{ item: `Regularización: ${c.regularizacion}`, ok: null }];
  }
  const claves = Object.keys(c).sort((x, y) => {
    const ix = ORDEN.indexOf(x);
    const iy = ORDEN.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
  });
  return claves.map((k) => {
    const v = String(c[k] ?? "").trim().toLowerCase();
    return { item: TEXTO_CHECKLIST[k] ?? k, ok: v === "si" || v === "sí" ? true : v === "no" ? false : null };
  });
}

export type FilaBoleta = {
  id: string;
  estado: string;
  checklist: unknown;
  firma_path: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string | null;
  placa_contenedor: string | null;
  deleted_at?: string | null;
};

/** La última validada; si ninguna está validada, la última creada. Nunca borradas. */
export function elegirBoleta(filas: FilaBoleta[]): FilaBoleta | null {
  const vivas = (filas || []).filter((b) => !b.deleted_at);
  const desc = (f: (b: FilaBoleta) => string | null) => (x: FilaBoleta, y: FilaBoleta) =>
    String(f(y) ?? "").localeCompare(String(f(x) ?? ""));
  const validadas = vivas.filter((b) => b.validated_at).sort(desc((b) => b.validated_at));
  if (validadas.length) return validadas[0];
  return vivas.sort(desc((b) => b.created_at))[0] ?? null;
}

export const VALIDADA_POR_REGULARIZACION = "Aplicaciones OLO (regularización)";

export type FilaChofer = {
  id: string;
  bodega_id: string;
  nombre: string | null;
  cedula: string | null;
  compania: string | null;
  placa_camion: string | null;
  tipo_vehiculo: string | null;
  celular: string | null;
  cedula_foto_path: string | null;
};

export type FuenteChoferBoleta = {
  despacho(despachoId: string, bodegaId: string): Promise<{ tenant_id: string; company: string; bodega_id: string; chofer_id: string | null } | null>;
  chofer(choferId: string): Promise<FilaChofer | null>;
  boletas(despachoId: string): Promise<FilaBoleta[]>;
  nombreUsuario(userId: string): Promise<string | null>;
  bucket: StorageBucket;
};

export type RespuestaChoferBoleta = {
  despacho_id: string;
  chofer: {
    nombre: string | null;
    cedula: string | null;
    compania: string | null;
    placa_camion: string | null;
    tipo_vehiculo: string | null;
    celular: string | null;
    cedula_foto: string | null;
  } | null;
  boleta: {
    id: string;
    estado: string;
    validada_at: string | null;
    validada_por: string | null;
    checklist: ItemChecklist[];
    firma: string | null;
    placa_contenedor: string | null;
  } | null;
};

export async function choferYBoletaDeDespacho(
  fuente: FuenteChoferBoleta,
  despachoId: string,
  bodegaId: string,
  { anchoCedula = FOTOS_ANCHO }: { anchoCedula?: number | null } = {}
): Promise<{ status: 200; body: RespuestaChoferBoleta } | { status: 404; body: { error: string } }> {
  const d = await fuente.despacho(despachoId, bodegaId);
  if (!d || d.bodega_id !== bodegaId) return { status: 404, body: { error: "Despacho no encontrado en esta bodega." } };
  const alcance = { tenant: d.tenant_id, company: d.company, bodega: d.bodega_id };

  // ── Chofer ──
  let chofer: RespuestaChoferBoleta["chofer"] = null;
  const c = d.chofer_id ? await fuente.chofer(d.chofer_id).catch(() => null) : null;
  if (c && c.id === d.chofer_id && c.bodega_id === d.bodega_id) {
    const ruta = c.cedula_foto_path;
    const cedulaFoto =
      ruta && rutaCedulaSegura(ruta, { ...alcance, choferId: c.id }) ? await firmarUna(fuente.bucket, ruta, anchoCedula) : null;
    chofer = {
      nombre: c.nombre ?? null,
      cedula: c.cedula ?? null,
      compania: c.compania ?? null,
      placa_camion: c.placa_camion ?? null,
      tipo_vehiculo: c.tipo_vehiculo ?? null,
      celular: c.celular ?? null,
      cedula_foto: cedulaFoto,
    };
  }

  // ── Boleta ──
  let boleta: RespuestaChoferBoleta["boleta"] = null;
  const b = elegirBoleta(await fuente.boletas(despachoId).catch(() => []));
  if (b) {
    const esRegularizacion =
      !!b.checklist && typeof b.checklist === "object" && typeof (b.checklist as Record<string, unknown>).regularizacion === "string";
    const validadaPor = !b.validated_by
      ? null
      : esRegularizacion
      ? VALIDADA_POR_REGULARIZACION
      : await fuente.nombreUsuario(b.validated_by).catch(() => null);
    const firma =
      b.firma_path && rutaFirmaSegura(b.firma_path, { ...alcance, boletaId: b.id }) ? await firmarUna(fuente.bucket, b.firma_path, null) : null;
    boleta = {
      id: b.id,
      estado: b.estado,
      validada_at: b.validated_at ?? null,
      validada_por: validadaPor,
      checklist: checklistAItems(b.checklist),
      firma,
      placa_contenedor: b.placa_contenedor ?? null,
    };
  }

  return { status: 200, body: { despacho_id: despachoId, chofer, boleta } };
}
