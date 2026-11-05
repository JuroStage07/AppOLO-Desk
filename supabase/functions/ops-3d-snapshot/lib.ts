// ops-3d-snapshot — lógica pura (sin Deno ni red), probada con Vitest.
// Contrato v1: SRO/docs/integracion-appolo-proceso3d.md

export const CONTRACT_VERSION = 1;

/** Estados que ya no se dibujan como "abiertos" (salieron del sitio o no cuentan). */
export const ESTADOS_CERRADOS = new Set(["despachado", "rechazado", "eliminado", "finalizado"]);

/** Días hacia atrás para buscar despachos que siguen abiertos. */
export const DIAS_ABIERTOS = 14;

type Row = Record<string, unknown>;

/** Desfase (ms) de una zona horaria en un instante: hora local − UTC. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** ¿Es una zona horaria IANA válida? */
export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Inicio y fin (exclusivo) en UTC del día "YYYY-MM-DD" en la zona `tz`. */
export function dayRangeUtc(date: string, tz: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!m) throw new Error("date inválida (YYYY-MM-DD)");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const at = (yy: number, mm: number, dd: number) => {
    const guess = new Date(Date.UTC(yy, mm, dd));
    // Dos pasadas para cubrir cambios de horario.
    let t = guess.getTime() - tzOffsetMs(guess, tz);
    t = guess.getTime() - tzOffsetMs(new Date(t), tz);
    return new Date(t);
  };
  return { start: at(y, mo, d), end: at(y, mo, d + 1) };
}

/** "YYYY-MM-DD" de hoy en la zona `tz`. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Número de puerta/andén ("Puerta 15" → 15, "0115" → 115 no: se toma el número tal cual). */
export function puertaNumero(v: unknown): number | null {
  const m = String(v ?? "").match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : null;
}

/**
 * Estado de despacho a partir del `tipo` de despacho_dev_actividad
 * ("despacho_en_proceso" → "en proceso"), validado contra el catálogo.
 */
export function estadoDesdeActividad(tipo: unknown, codigos: Set<string>): string | null {
  const t = String(tipo ?? "");
  if (!t.startsWith("despacho_")) return null;
  const raw = t.slice("despacho_".length);
  if (codigos.has(raw)) return raw;
  const conEspacios = raw.replace(/_/g, " ");
  return codigos.has(conEspacios) ? conEspacios : null;
}

/** Historial de estados por despacho, ordenado por fecha, sin repeticiones consecutivas. */
export function historialPorDespacho(actividad: Row[], codigos: Set<string>): Map<string, Array<{ estado: string; at: string }>> {
  const out = new Map<string, Array<{ estado: string; at: string }>>();
  const rows = [...(actividad || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const a of rows) {
    const estado = estadoDesdeActividad(a.tipo, codigos);
    if (!estado) continue;
    const id = String(a.entidad_id);
    const list = out.get(id) || [];
    if (list[list.length - 1]?.estado !== estado) list.push({ estado, at: String(a.created_at) });
    out.set(id, list);
  }
  return out;
}

/** Tipos de las posiciones del acomodo (`slots[].type`), o null si no hay acomodo. */
export function layoutTipos(slots: unknown): string[] | null {
  if (!Array.isArray(slots) || !slots.length) return null;
  return slots.map((s) => String((s as Row)?.type ?? "E"));
}

/** Catálogo de puertas usadas, ordenado por número y sin duplicados por número. */
export function catalogoPuertas(puertas: unknown[]): string[] {
  const porNumero = new Map<number, string>();
  for (const p of puertas || []) {
    const s = String(p ?? "").trim();
    const n = puertaNumero(s);
    if (n === null || porNumero.has(n)) continue;
    porNumero.set(n, s);
  }
  return [...porNumero.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

/**
 * Un despacho en la forma del contrato. Sin datos personales del chofer más
 * allá del nombre (nada de cédulas, fotos ni firmas).
 */
export function mapDispatch(
  d: Row,
  ctx: {
    estadoNombre: Map<string, string>;
    choferNombre: Map<string, string>;
    layout: Map<string, unknown>;
    historial: Map<string, Array<{ estado: string; at: string }>>;
  }
) {
  const id = String(d.id);
  const estado = String(d.estado ?? "");
  return {
    id,
    estado,
    estado_nombre: ctx.estadoNombre.get(estado) ?? estado,
    puerta: (d.puerta as string) ?? null,
    placa: (d.placa as string) || (d.placa_contenedor as string) || null,
    chofer: d.chofer_id ? ctx.choferNombre.get(String(d.chofer_id)) ?? null : null,
    transportista: (d.transportista as string) ?? null,
    tienda: (d.tienda as string) ?? null,
    referencia: (d.referencia as string) ?? null,
    tipo: (d.tipo as string) ?? null,
    tarimas_s: Number(d.tarimas_s) || 0,
    tarimas_d: Number(d.tarimas_d) || 0,
    // Solo el conteo: las fotos se piden aparte (?fotos_despacho=<id>) para no
    // firmar cientos de URLs en cada snapshot.
    fotos_count: Number(d.fotos_count) || 0,
    layout: layoutTipos(ctx.layout.get(id)),
    created_at: (d.created_at as string) ?? null,
    updated_at: (d.updated_at as string) ?? null,
    finalized_at: (d.finalized_at as string) ?? null,
    history: ctx.historial.get(id) ?? [],
  };
}

const toMs = (v: unknown) => {
  const t = v ? new Date(String(v)).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Estado que SRO muestra en el patio de espera de salida, sin importar el día. */
export const ESTADO_ESPERA_CHOFER = "chofer_pendiente";

/**
 * Despachos que van en la foto (nunca los eliminados):
 *   - todos los del día (por `fecha`);
 *   - todos los "chofer_pendiente", de cualquier día: SRO los lleva a su patio de
 *     espera de salida para ver lo atrasado tal cual (al 03/11/2026 eran 462);
 *   - de días anteriores, los que siguen cargando: estado no cerrado y carga sin
 *     finalizar antes de hoy. Los demás finalizados de días anteriores quedan fuera.
 */
export function seleccionarDespachos(rows: Row[], start: Date, end: Date): Row[] {
  const s = start.getTime();
  const e = end.getTime();
  const vistos = new Set<string>();
  return (rows || []).filter((d) => {
    const id = String(d.id);
    if (vistos.has(id)) return false;
    vistos.add(id);
    if (d.deleted_at || d.estado === "eliminado") return false;
    const f = toMs(d.fecha);
    if (f === null || f >= e) return false;
    if (f >= s) return true; // del día
    if (d.estado === ESTADO_ESPERA_CHOFER) return true; // patio de espera, cualquier día
    if (ESTADOS_CERRADOS.has(String(d.estado ?? ""))) return false;
    const fin = toMs(d.finalized_at);
    return fin === null || fin >= s; // carga sin finalizar, o finalizada hoy
  });
}
