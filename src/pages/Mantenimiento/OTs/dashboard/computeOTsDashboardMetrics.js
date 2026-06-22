import { OT_LUGARES_PROBLEMA, OT_TIPOS_PROBLEMA } from "../../../../config/otOptions";
import { dateInRange, formatYMD, getPeriodBounds } from "./periodUtils";

const OTROS_TIPO_PROBLEMA = "Otros";
const OTROS_LUGAR_PROBLEMA = "Otros";

function normalizeProblemTypeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

const allowedProblemTypesByKey = new Map(
  OT_TIPOS_PROBLEMA.map((tipo) => [normalizeProblemTypeKey(tipo), tipo])
);

const allowedProblemPlacesByKey = new Map(
  OT_LUGARES_PROBLEMA.map((lugar) => [normalizeProblemTypeKey(lugar), lugar])
);

/**
 * Convierte el string `tiempoRespuesta` (p. ej. "5 hrs", "2 d 3 hrs", "1 hr")
 * a horas. Devuelve null si no hay un valor numérico reconocible.
 */
function parseTiempoRespuestaHours(value) {
  const str = String(value || "").trim();
  if (!str) return null;
  const daysMatch = str.match(/(\d+)\s*d\b/);
  const hoursMatch = str.match(/(\d+)\s*hr/);
  if (!daysMatch && !hoursMatch) return null;
  const days = daysMatch ? Number(daysMatch[1]) : 0;
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  return days * 24 + hours;
}

/** Formatea horas (entero) al mismo estilo que la app: "2 d 3 hrs" / "5 hrs". */
function formatTiempoRespuestaHours(totalHours) {
  const total = Math.max(0, Math.round(Number(totalHours) || 0));
  const days = Math.floor(total / 24);
  const hours = total % 24;
  if (days > 0) return `${days} d ${hours} hrs`;
  return `${total} ${total === 1 ? "hr" : "hrs"}`;
}

function avgTiempoRespuesta(rows) {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const hrs = parseTiempoRespuestaHours(r?.tiempoRespuesta);
    if (hrs == null) continue;
    sum += hrs;
    count += 1;
  }
  const hours = count > 0 ? sum / count : 0;
  return {
    count,
    hours,
    label: count > 0 ? formatTiempoRespuestaHours(hours) : "—",
  };
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + mondayOffset);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatShortDateLabel(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function normalizeCreatedAtToDate(createdAt) {
  if (!createdAt) return new Date(NaN);
  if (createdAt instanceof Date) return createdAt;
  if (typeof createdAt?.toDate === "function") return createdAt.toDate();
  if (typeof createdAt === "number") return new Date(createdAt);
  return new Date(NaN);
}

function filterRows(rows, start, end) {
  return rows.filter((r) => dateInRange(normalizeCreatedAtToDate(r.createdAt), start, end));
}

function countByCalendarDay(rows) {
  const map = new Map();
  for (const r of rows) {
    const d = normalizeCreatedAtToDate(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = formatYMD(d);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([date, count]) => ({
      date,
      count,
      label: (() => {
        const [y, m, dd] = date.split("-").map(Number);
        const d = new Date(y, m - 1, dd, 12, 0, 0, 0);
        return formatShortDateLabel(d);
      })(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function countByRangeDate(rows, start, end) {
  const counts = new Map();
  for (const r of rows) {
    const d = normalizeCreatedAtToDate(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = formatYMD(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(12, 0, 0, 0);

  while (cursor <= endDay) {
    const date = formatYMD(cursor);
    out.push({
      date,
      label: formatShortDateLabel(cursor),
      count: counts.get(date) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function busiestQuietestByCalendar(rows) {
  const byDay = countByCalendarDay(rows);
  if (!byDay.length) return { busiest: null, quietest: null, series: [] };
  const sorted = [...byDay].sort((a, b) => b.count - a.count);
  return {
    busiest: sorted[0],
    quietest: sorted[sorted.length - 1],
    series: byDay,
  };
}

function lowTrafficHints(rows) {
  const byDay = countByCalendarDay(rows);
  if (byDay.length < 3) return { hints: [], threshold: 0 };
  const counts = byDay.map((x) => x.count).sort((a, b) => a - b);
  const p25 = counts[Math.floor(counts.length * 0.25)];
  const hints = byDay
    .filter((x) => x.count <= p25)
    .sort((a, b) => a.count - b.count)
    .slice(0, 8);
  return { hints, threshold: p25 };
}

function stateSummary(rows) {
  const out = {
    total: rows.length,
    solicitada: 0,
    proceso: 0,
    revision: 0,
    finalizada: 0,
  };
  for (const r of rows) {
    const st = String(r.OTState || "Solicitada");
    if (st === "En proceso") out.proceso += 1;
    else if (st === "En revisión") out.revision += 1;
    else if (st === "Finalizada") out.finalizada += 1;
    else out.solicitada += 1;
  }
  return out;
}

function topByField(rows, { idField, nameField, limit = 8 }) {
  const map = new Map();
  for (const r of rows) {
    const id = String(r?.[idField] || "").trim();
    const name = String(r?.[nameField] || "").trim() || "—";
    if (!id && name === "—") continue;
    const key = id || name;
    map.set(key, { key, name, count: (map.get(key)?.count ?? 0) + 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function weeklyLeadersBySolicitante(rows, rangeStart, rangeEnd) {
  const weeks = new Map();
  for (const r of rows) {
    const d = normalizeCreatedAtToDate(r.createdAt);
    if (Number.isNaN(d.getTime()) || d < rangeStart || d > rangeEnd) continue;

    const ws = startOfWeekMonday(d);
    const wk = formatYMD(ws);
    if (!weeks.has(wk)) {
      weeks.set(wk, {
        weekStart: wk,
        weekLabel: `Semana del ${ws.toLocaleDateString("es-CR", {
          day: "numeric",
          month: "long",
        })}`,
        by: new Map(),
      });
    }
    const row = weeks.get(wk);
    const key =
      String(r?.solicitanteFicha || "").trim() ||
      String(r?.solicitanteNombre || "").trim() ||
      "—";
    const prev = row.by.get(key) ?? { key, name: String(r?.solicitanteNombre || "—"), count: 0 };
    prev.count += 1;
    prev.name = String(r?.solicitanteNombre || prev.name || "—");
    row.by.set(key, prev);
  }

  return [...weeks.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => {
      let top = null;
      for (const x of w.by.values()) {
        if (!top || x.count > top.count) top = x;
      }
      return { weekStart: w.weekStart, weekLabel: w.weekLabel, leader: top };
    });
}

export function computeOTsDashboardMetrics({ rows, period, customFrom, customTo }) {
  const { start, end } = getPeriodBounds(period, customFrom, customTo);
  const filtered = filterRows(rows, start, end);

  const byRangeDate = countByRangeDate(filtered, start, end);
  const { busiest, quietest, series: byCalendarDay } = busiestQuietestByCalendar(filtered);
  const summary = stateSummary(filtered);
  const lowTraffic = lowTrafficHints(filtered);
  const tiempoRespuestaPromedio = avgTiempoRespuesta(filtered);

  const topSolicitantes = topByField(filtered, {
    idField: "solicitanteFicha",
    nameField: "solicitanteNombre",
    limit: 8,
  });

  // Responsables: se usa responsableNombre como ranking textual (puede ser lista)
  const topResponsables = (() => {
    const map = new Map();
    for (const r of filtered) {
      const raw = String(r?.responsableNombre || "").trim();
      if (!raw) continue;
      const parts = raw
        .split(/[,;]/)
        .map((p) => String(p).trim())
        .filter(Boolean);
      for (const name of parts) {
        map.set(name, { name, count: (map.get(name)?.count ?? 0) + 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  const weeklySolicitanteLeaders = weeklyLeadersBySolicitante(filtered, start, end);

  const topDepartamentos = (() => {
    const map = new Map();
    const aliases = { ingeniera: "Ingeniería" };
    for (const r of filtered) {
      let dep = String(r?.departamento || "").trim();
      if (!dep) continue;
      const key = dep.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (aliases[key]) dep = aliases[key];
      map.set(dep, { name: dep, count: (map.get(dep)?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  const topCreatedAreas = (() => {
    const map = new Map();
    for (const r of filtered) {
      const area = String(r?.createdArea || "").trim();
      if (!area) continue;
      map.set(area, { name: area, count: (map.get(area)?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  const topLugaresProblema = (() => {
    const map = new Map();
    for (const r of filtered) {
      const lugarRaw = String(r?.lugarProblema || "").trim();
      const lugar = allowedProblemPlacesByKey.get(normalizeProblemTypeKey(lugarRaw)) || OTROS_LUGAR_PROBLEMA;
      map.set(lugar, { name: lugar, count: (map.get(lugar)?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  const topTiposProblema = (() => {
    const map = new Map();
    for (const r of filtered) {
      const tipoRaw = String(r?.tipoProblema || "").trim();
      const tipo = allowedProblemTypesByKey.get(normalizeProblemTypeKey(tipoRaw)) || OTROS_TIPO_PROBLEMA;
      map.set(tipo, { name: tipo, count: (map.get(tipo)?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  return {
    range: { start, end },
    summary,
    tiempoRespuestaPromedio,
    byRangeDate,
    busiestDay: busiest,
    quietestDay: quietest,
    byCalendarDay,
    lowTraffic,
    topSolicitantes,
    topResponsables,
    topDepartamentos,
    topCreatedAreas,
    topLugaresProblema,
    topTiposProblema,
    weeklySolicitanteLeaders,
  };
}
