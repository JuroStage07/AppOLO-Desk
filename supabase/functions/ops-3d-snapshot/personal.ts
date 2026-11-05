// ops-3d-snapshot · modo personal (?personal=1): personal en sitio según el reloj
// BIT2 de OLO. Lógica pura (sin Deno ni red), probada con Vitest.
// Contrato: SRO/docs/integracion-appolo-proceso3d.md §1d.
//
// Los datos los escribe bit2-api en ops3d_personal_dia / ops3d_personal_sync.
// El estado de cada persona se calcula aquí, con la hora actual:
//   - número impar de marcas                                  → en_sitio
//   - par y su horario_salida + 30 min todavía no llega        → pausa
//   - par y ya pasó su horario_salida + 30 min, o sin horario  → salio
// Nunca se envía la cédula ni datos de horas extra.

import type { SroAuthError, SroAuthOk } from "../_shared/sroAuth.ts";

export const PERMISO_PERSONAL = "proceso3d.personal.view";
/** El reloj BIT2 solo existe en OLO: es la única bodega con datos de personal. */
export const BODEGA_BIT2 = "CR-OLO-CLIRO";

const CR_OFFSET_MS = -6 * 3600 * 1000; // Costa Rica no tiene horario de verano.
const MIN = 60 * 1000;
const TOLERANCIA_PAUSA_MS = 30 * MIN;
const TOLERANCIA_TARDE_MS = 5 * MIN;
const SYNC_MAX_MS = 5 * MIN;
const MARCAS_MAX_MS = 30 * MIN;
/** Horario operativo en el que se espera que entren marcas (minutos del día en CR). */
const OPERATIVO = { desde: 6 * 60, hasta: 22 * 60 + 30 };

export type Escala = "gerente" | "coordinador" | "colaborador";
export type Estado = "en_sitio" | "pausa" | "salio";

/** Fila de ops3d_personal_dia tal como la devuelve PostgREST. */
export type FilaPersonal = {
  fecha: string;
  id_employee: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  escala: Escala;
  coordinador: string;
  gerente: string;
  marcas: string[] | null;
  horario_entrada: string | null;
  horario_salida: string | null;
};

export type FilaSync = { ultima_sync: string | null; marcas_hasta: string | null } | null;

export type Persona = {
  id: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  escala: Escala;
  coordinador: string;
  gerente: string;
  estado: Estado;
  entrada: string | null;
  salida: string | null;
  marcas: string[];
  horario: { entrada: string | null; salida: string | null };
  tarde: boolean;
};

const ORDEN_ESCALA: Record<Escala, number> = { gerente: 0, coordinador: 1, colaborador: 2 };

/** Día de hoy (YYYY-MM-DD) en Costa Rica. */
export function hoyCR(now: Date): string {
  return new Date(now.getTime() + CR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante (ms) de "HH:MM" del día `fecha` en Costa Rica. */
export function instanteCR(fecha: string, hhmm: string): number {
  return Date.parse(`${fecha}T${hhmm}:00-06:00`);
}

/** ms → "2026-11-05T06:57:00-06:00". */
export function isoCR(ms: number): string {
  return new Date(ms + CR_OFFSET_MS).toISOString().slice(0, 19) + "-06:00";
}

/** ms → "06:57" (hora local CR). */
export function horaCR(ms: number): string {
  return new Date(ms + CR_OFFSET_MS).toISOString().slice(11, 16);
}

const HHMM = /^[0-2]\d:[0-5]\d$/;
const hhmm = (s: string | null | undefined) => (s && HHMM.test(s) ? s : null);

/** Marcas válidas y ordenadas, en ms. */
function marcasMs(f: FilaPersonal): number[] {
  return (f.marcas ?? [])
    .map((m) => Date.parse(m))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/** Fin programado del turno (ms); null sin horario. Si la salida es antes que la entrada, cruza la medianoche. */
export function salidaProgramada(f: FilaPersonal): number | null {
  const s = hhmm(f.horario_salida);
  if (!s) return null;
  let t = instanteCR(f.fecha, s);
  const e = hhmm(f.horario_entrada);
  if (e && s < e) t += 24 * 60 * MIN;
  return t;
}

export function estadoPersona(f: FilaPersonal, now: Date): Estado {
  const n = marcasMs(f).length;
  if (n % 2 === 1) return "en_sitio";
  const fin = salidaProgramada(f);
  if (fin !== null && n > 0 && now.getTime() < fin + TOLERANCIA_PAUSA_MS) return "pausa";
  return "salio";
}

/** Tramos en sitio: pares (entrada, salida); la última entrada sin pareja sigue abierta hasta `now`. */
export function tramos(marcas: number[], now: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < marcas.length; i += 2) {
    const ini = marcas[i];
    const fin = i + 1 < marcas.length ? marcas[i + 1] : Math.max(ini, now);
    out.push([ini, fin]);
  }
  return out;
}

/**
 * Personas en sitio en cada hora del día (0–23, hora de CR): cuenta a quien estuvo
 * dentro en algún momento de esa hora. Las pausas no cuentan; las horas futuras dan 0.
 */
export function presentesPorHora(filas: FilaPersonal[], fecha: string, now: Date): number[] {
  const horas = new Array(24).fill(0);
  const t0 = instanteCR(fecha, "00:00");
  for (const f of filas) {
    const ts = tramos(marcasMs(f), now.getTime());
    for (let h = 0; h < 24; h++) {
      const ini = t0 + h * 60 * MIN;
      const fin = ini + 60 * MIN;
      if (ts.some(([a, b]) => a < fin && b > ini)) horas[h]++;
    }
  }
  return horas;
}

/** ¿Los datos están atrasados? Sync de bit2-api > 5 min, o (en horario operativo) marcas > 30 min. */
export function estaDesactualizado(sync: FilaSync, now: Date): boolean {
  const t = now.getTime();
  const ultima = sync?.ultima_sync ? Date.parse(sync.ultima_sync) : NaN;
  if (!Number.isFinite(ultima) || t - ultima > SYNC_MAX_MS) return true;
  const local = new Date(t + CR_OFFSET_MS);
  const minuto = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minuto < OPERATIVO.desde || minuto > OPERATIVO.hasta) return false;
  const hasta = sync?.marcas_hasta ? Date.parse(sync.marcas_hasta) : NaN;
  return !Number.isFinite(hasta) || t - hasta > MARCAS_MAX_MS;
}

export function mapPersona(f: FilaPersonal, now: Date): Persona {
  const ms = marcasMs(f);
  const estado = estadoPersona(f, now);
  const he = hhmm(f.horario_entrada);
  const entrada = ms.length ? ms[0] : null;
  return {
    id: String(f.id_employee),
    nombre: f.nombre,
    puesto: f.puesto ?? null,
    departamento: f.departamento ?? null,
    escala: f.escala,
    coordinador: f.coordinador,
    gerente: f.gerente,
    estado,
    entrada: entrada !== null ? isoCR(entrada) : null,
    salida: estado === "salio" && ms.length ? isoCR(ms[ms.length - 1]) : null,
    marcas: ms.map(horaCR),
    horario: { entrada: he, salida: hhmm(f.horario_salida) },
    tarde: entrada !== null && he !== null && entrada > instanteCR(f.fecha, he) + TOLERANCIA_TARDE_MS,
  };
}

/** Cuerpo 200 con disponible: true. */
export function armarPersonal(filas: FilaPersonal[], sync: FilaSync, fecha: string, now: Date) {
  const personas = filas
    .map((f) => mapPersona(f, now))
    .sort(
      (a, b) =>
        a.gerente.localeCompare(b.gerente, "es") ||
        a.coordinador.localeCompare(b.coordinador, "es") ||
        ORDEN_ESCALA[a.escala] - ORDEN_ESCALA[b.escala] ||
        a.nombre.localeCompare(b.nombre, "es")
    );
  const cuenta = (e: Estado) => personas.filter((p) => p.estado === e).length;
  const porEscala = { gerente: 0, coordinador: 0, colaborador: 0 };
  for (const p of personas) porEscala[p.escala]++;
  const enCR = (s: string | null | undefined) => {
    const ms = s ? Date.parse(s) : NaN;
    return Number.isFinite(ms) ? isoCR(ms) : null;
  };
  const ultima = enCR(sync?.ultima_sync);
  return {
    disponible: true as const,
    fecha,
    actualizado_at: ultima,
    ultima_sync: ultima,
    marcas_hasta: enCR(sync?.marcas_hasta),
    desactualizado: estaDesactualizado(sync, now),
    resumen: { en_sitio: cuenta("en_sitio"), en_pausa: cuenta("pausa"), salieron: cuenta("salio"), por_escala: porEscala },
    presentes_por_hora: presentesPorHora(filas, fecha, now),
    personas,
  };
}

export type DepsPersonal = {
  autorizar: (permiso: string) => Promise<SroAuthOk | SroAuthError>;
  /** bodega_id de AppOLO del almacén de SRO (ops3d_bodega_sro activo), o null. */
  bodega: () => Promise<string | null>;
  filas: (bodegaId: string, fecha: string) => Promise<FilaPersonal[]>;
  sync: (bodegaId: string) => Promise<FilaSync>;
};

/** Modo ?personal=1 completo: permiso → bodega → datos. */
export async function respuestaPersonal(
  deps: DepsPersonal,
  now: Date = new Date()
): Promise<{ status: number; body: unknown }> {
  const auth = await deps.autorizar(PERMISO_PERSONAL);
  if ("status" in auth) return { status: auth.status, body: { error: auth.error } };

  const bodegaId = await deps.bodega();
  if (bodegaId !== BODEGA_BIT2) return { status: 200, body: { disponible: false } };

  const fecha = hoyCR(now);
  const [filas, sync] = await Promise.all([deps.filas(bodegaId, fecha), deps.sync(bodegaId)]);
  return { status: 200, body: armarPersonal(filas, sync, fecha, now) };
}
