export const PERIOD = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  CUSTOM: "custom",
};

export function formatYMD(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(s) {
  if (!s) return new Date(NaN);
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Lunes como inicio de semana */
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + mondayOffset);
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Rango basado en fechas (filtro por `createdAt` de solicitudesOT).
 * @param {string} period
 * @param {string} [customFrom] YYYY-MM-DD
 * @param {string} [customTo] YYYY-MM-DD
 */
export function getPeriodBounds(period, customFrom, customTo) {
  const now = new Date();

  if (period === PERIOD.DAY) {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === PERIOD.WEEK) {
    return { start: startOfWeek(now), end: endOfDay(now) };
  }

  if (period === PERIOD.MONTH) {
    return { start: startOfMonth(now), end: endOfDay(now) };
  }

  if (period === PERIOD.CUSTOM && customFrom && customTo) {
    const a = parseYMD(customFrom);
    const b = parseYMD(customTo);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
      return getPeriodBounds(PERIOD.MONTH, "", "");
    }
    const start = startOfDay(a <= b ? a : b);
    const end = endOfDay(a <= b ? b : a);
    return { start, end };
  }

  return getPeriodBounds(PERIOD.MONTH, "", "");
}

export function dateInRange(d, start, end) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

