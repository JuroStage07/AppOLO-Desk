import { dateInRange, formatYMD, getPeriodBounds } from "./periodUtils";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_LABELS_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

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

function countByWeekday(rows) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const d = normalizeCreatedAtToDate(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    counts[d.getDay()] += 1;
  }
  return DAY_LABELS.map((label, i) => ({
    day: label,
    dayFull: DAY_LABELS_FULL[i],
    count: counts[i],
    weekday: i,
  }));
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

  const byWeekday = countByWeekday(filtered);
  const { busiest, quietest, series: byCalendarDay } = busiestQuietestByCalendar(filtered);
  const summary = stateSummary(filtered);
  const lowTraffic = lowTrafficHints(filtered);

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

  return {
    range: { start, end },
    summary,
    byWeekday,
    busiestDay: busiest,
    quietestDay: quietest,
    byCalendarDay,
    lowTraffic,
    topSolicitantes,
    topResponsables,
    weeklySolicitanteLeaders,
  };
}

