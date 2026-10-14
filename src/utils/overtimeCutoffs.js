// Cortes (períodos de pago) de horas extra.
//
// La configuración vive en overtimeConfig/cutoffDates: { startDay, endDay }.
// Un corte cierra el día `endDay` de cada mes; empieza el `startDay` del mismo
// mes (si startDay <= endDay) o del mes anterior (cortes que cruzan de mes,
// ej: 21 → 20). Una fecha pertenece al corte que cierra en la próxima
// ocurrencia de `endDay` (incluida la misma fecha).
//
// Si el mes no tiene ese día (endDay = 31 en abril), se usa el último día del mes.

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const pad2 = (n) => String(n).padStart(2, "0");

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Fecha local (medianoche) con el día recortado al último día del mes.
function clampedDate(year, month, day) {
  const first = new Date(year, month, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  return new Date(y, m, Math.min(day, daysInMonth(y, m)));
}

/** "YYYY-MM-DD" a partir de un Date local. */
export function isoDate(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Convierte una fecha de registro a Date local a medianoche.
 * Acepta Date, "YYYY-MM-DD", "DD/MM/YYYY" y dayKey "DD-MM-YY".
 */
export function toLocalDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  }
  const text = String(raw).trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function fmtShort(date, withYear) {
  const base = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return withYear ? `${base} ${date.getFullYear()}` : base;
}

/** "21 sep – 20 oct 2026" (o "21 dic 2025 – 20 ene 2026" si cruza de año). */
export function formatPeriodLabel(period) {
  if (!period) return "";
  const crossesYear = period.start.getFullYear() !== period.end.getFullYear();
  return `${fmtShort(period.start, crossesYear)} – ${fmtShort(period.end, true)}`;
}

/**
 * Corte al que pertenece una fecha. Devuelve null si no hay `endDay` configurado
 * o la fecha no es válida.
 * @returns {{ key: string, start: Date, end: Date, label: string } | null}
 */
export function cutoffPeriodFor(rawDate, config) {
  const endDay = Number(config?.endDay) || null;
  const date = toLocalDate(rawDate);
  if (!endDay || !date) return null;

  let end = clampedDate(date.getFullYear(), date.getMonth(), endDay);
  if (end < date) end = clampedDate(date.getFullYear(), date.getMonth() + 1, endDay);

  const startDay = Number(config?.startDay) || null;
  let start;
  if (startDay) {
    start =
      startDay <= endDay
        ? clampedDate(end.getFullYear(), end.getMonth(), startDay)
        : clampedDate(end.getFullYear(), end.getMonth() - 1, startDay);
  } else {
    // Sin startDay: el corte empieza el día siguiente al cierre anterior.
    const prevEnd = clampedDate(end.getFullYear(), end.getMonth() - 1, endDay);
    start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
  }

  const period = { key: isoDate(end), start, end };
  return { ...period, label: formatPeriodLabel(period) };
}

/**
 * Lista de cortes, del actual hacia atrás (`count` en total).
 * @returns {Array<{ key, start, end, label }>}
 */
export function listCutoffPeriods(config, { count = 12, today = new Date() } = {}) {
  const endDay = Number(config?.endDay) || null;
  const current = cutoffPeriodFor(today, config);
  if (!current) return [];

  const periods = [current];
  let cursor = current;
  while (periods.length < count) {
    const anchor = clampedDate(cursor.end.getFullYear(), cursor.end.getMonth() - 1, endDay);
    cursor = cutoffPeriodFor(anchor, config);
    periods.push(cursor);
  }
  return periods;
}

/**
 * Estado de un corte respecto del corte actual:
 * - "current": es el corte en curso
 * - "closed":  ya cerró (lo pendiente de ese corte está atrasado)
 * - "future":  todavía no empieza
 */
export function periodStatus(period, currentPeriod) {
  if (!period || !currentPeriod) return null;
  if (period.end < currentPeriod.start) return "closed";
  if (period.start > currentPeriod.end) return "future";
  return "current";
}

/** Valores especiales del filtro de corte. */
export const ALL_PERIODS = "all";
export const CURRENT_PERIOD = "current";

/**
 * Resuelve la selección del filtro a { period, range }.
 * "all" abarca desde el corte más viejo listado hasta el actual (period = null).
 */
export function resolvePeriodSelection(selection, periods) {
  if (!periods?.length) return { period: null, range: null };
  if (selection === ALL_PERIODS) {
    const oldest = periods[periods.length - 1];
    return { period: null, range: { start: oldest.start, end: periods[0].end } };
  }
  const period =
    selection === CURRENT_PERIOD
      ? periods[0]
      : periods.find((p) => p.key === selection) || periods[0];
  return { period, range: { start: period.start, end: period.end } };
}

/** ¿La fecha cae dentro del corte (inclusive)? */
export function isInPeriod(rawDate, period) {
  const date = toLocalDate(rawDate);
  if (!date || !period) return false;
  return date >= period.start && date <= period.end;
}
