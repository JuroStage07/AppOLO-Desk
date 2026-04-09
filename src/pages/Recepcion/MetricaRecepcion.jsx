import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileSpreadsheet,
  Info,
  Loader2,
  Settings,
  TrendingUp,
  User,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { filterByUserScope } from "../../utils/dataScope";
import { buildMetricaRecepcionExcelProBuffer } from "../../utils/metricaRecepcionExcelPro";
import useIsMobile from "../../hooks/useIsMobile";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";
const ANDEN_SETTINGS_KEY = "recepcion.metrica.andenes.settings.v1";
const EXCLUDED_ANDEN_USERS_LEGACY_KEY =
  "recepcion.metrica.andenes.excludedUsers.v1";

function fmtMinutesFromMs(ms) {
  const n = Number(ms || 0);
  if (!n) return "0 min";

  const totalMin = Math.round(n / 60000);
  if (totalMin < 60) return `${totalMin} min`;

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Estados de la acción de descarga para el listado (alineado con recepción). */
function getAccionEstadoRecepcion(item) {
  const completedAt = item?.completedAt ?? item?.completeAt;
  if (completedAt) return "Completa";
  if (item?.startedAt) return "En proceso";
  return "Creada";
}

function formatDateTimeShort(ts) {
  const d = toDateSafe(ts);
  if (!d) return "—";
  return d.toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionStarterIdentity(row) {
  const uid = String(
    row?.starterUid ??
      row?.startedByUid ??
      row?.startedBy ??
      row?.creadoPorUid ??
      row?.createdBy ??
      "sin_uid"
  ).trim();
  const label = String(
    row?.starter ??
      row?.startedByName ??
      row?.creadoPorNombre ??
      row?.createdByName ??
      row?.responsableNombre ??
      uid
  ).trim();
  return { uid, label: label || "Usuario" };
}

function normalizeExcludedUserToken(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseYMD(s) {
  if (!s || !String(s).trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(dt.getTime()) ? null : dt;
}

function formatSelectedDateLabel(value) {
  const d = parseYMD(value);
  if (!d) return "Fecha seleccionada";
  return d.toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function startOfDayDate(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayDate(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDayKeysForFilter(filterKey, selectedDate = "") {
  const now = new Date();

  if (filterKey === "fecha") {
    const parsed = parseYMD(selectedDate);
    return parsed ? [ymd(parsed)] : [];
  }

  if (filterKey === "hoy") {
    return [ymd(now)];
  }

  if (filterKey === "semana") {
    const start = startOfWeekMonday(now);
    const out = [];
    const cur = new Date(start);
    for (let i = 0; i < 7; i++) {
      out.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  if (filterKey === "mes") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let day = 1; day <= last; day++) {
      out.push(ymd(new Date(y, m, day)));
    }
    return out;
  }

  // rango temporal: por ahora últimos 5 días
  const out = [];
  const cur = new Date(now);
  cur.setDate(cur.getDate() - 4);
  for (let i = 0; i < 5; i++) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function sum(arr, getter) {
  return arr.reduce((acc, item) => acc + Number(getter(item) || 0), 0);
}

function fmtInt(value) {
  return new Intl.NumberFormat("es-CR").format(Number(value || 0));
}

function fmtOneDecimal(value) {
  return new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function getComplianceTone(value) {
  const n = Number(value || 0);
  if (n >= 85) return "good";
  if (n >= 70) return "warn";
  return "danger";
}

function buildAlertsFromDocs({
  compliance = 0,
  tiempoPromedioMs = 0,
  docs = [],
}) {
  const pendingUsers = new Set();

  for (const d of docs) {
    const starters = Array.isArray(d?.starters) ? d.starters : [];
    for (const s of starters) {
      const iniciadas = Number(s?.iniciadasDia || 0);
      const finalizadas = Number(s?.finalizadasDia || 0);
      if (iniciadas > finalizadas) {
        pendingUsers.add(String(s?.starterUid || s?.starter || "Operador"));
      }
    }
  }

  const alerts = [];

  if (compliance < 70) {
    alerts.push({
      tone: "danger",
      title: "Cumplimiento bajo",
      description: `El cierre operativo se encuentra en ${compliance}% para el período actual.`,
    });
  } else if (compliance < 85) {
    alerts.push({
      tone: "warn",
      title: "Cumplimiento en observación",
      description: `El cumplimiento actual es de ${compliance}% y todavía puede mejorar.`,
    });
  } else {
    alerts.push({
      tone: "good",
      title: "Cumplimiento saludable",
      description: `La operación mantiene un cumplimiento de ${compliance}% en el período.`,
    });
  }

  if (pendingUsers.size > 0) {
    alerts.push({
      tone: "warn",
      title: "Usuarios con acciones pendientes",
      description: `${pendingUsers.size} operador(es) tienen iniciadas sin cierre registrado.`,
    });
  }

  if (tiempoPromedioMs >= 12 * 60 * 60 * 1000) {
    alerts.push({
      tone: "danger",
      title: "Tiempo promedio elevado",
      description: `El tiempo promedio actual es de ${fmtMinutesFromMs(tiempoPromedioMs)}.`,
    });
  }

  if (!alerts.length) {
    alerts.push({
      tone: "good",
      title: "Operación estable",
      description: "No se identifican alertas relevantes para el período seleccionado.",
    });
  }

  return {
    alerts: alerts.slice(0, 4),
    pendingUsers: pendingUsers.size,
  };
}

function groupStarters(docs = []) {
  const map = new Map();

  for (const d of docs) {
    const starters = Array.isArray(d?.starters) ? d.starters : [];
    for (const s of starters) {
      const key = String(s?.starterUid || s?.starter || "—");
      if (!map.has(key)) {
        map.set(key, {
          label: s?.starter || "—",
          starterUid: s?.starterUid || null,
          iniciadas: 0,
          finalizadas: 0,
          bultos: 0,
          tiempoTotalMs: 0,
        });
      }

      const row = map.get(key);
      row.iniciadas += Number(s?.iniciadasDia || 0);
      row.finalizadas += Number(s?.finalizadasDia || 0);
      row.bultos += Number(s?.bultosTotalesDia || 0);
      row.tiempoTotalMs += Number(s?.tiempoTotalMsDia || 0);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.finalizadas - a.finalizadas)
    .slice(0, 5)
    .map((x) => ({
      label: x.label,
      value: x.finalizadas,
    }));
}

function buildTeamProductivity(docs = []) {
  const map = new Map();

  for (const d of docs) {
    const starters = Array.isArray(d?.starters) ? d.starters : [];

    for (const s of starters) {
      const key = String(s?.starterUid || s?.starter || "—");

      if (!map.has(key)) {
        map.set(key, {
          label: s?.starter || "—",
          starterUid: s?.starterUid || null,
          iniciadas: 0,
          finalizadas: 0,
          bultos: 0,
          tiempoTotalMs: 0,
          tiempoPromedioMs: 0,
        });
      }

      const row = map.get(key);
      row.iniciadas += Number(s?.iniciadasDia || 0);
      row.finalizadas += Number(s?.finalizadasDia || 0);
      row.bultos += Number(s?.bultosTotalesDia || 0);
      row.tiempoTotalMs += Number(s?.tiempoTotalMsDia || 0);
    }
  }

  const arr = Array.from(map.values()).map((x) => ({
    ...x,
    tiempoPromedioMs:
      x.finalizadas > 0 ? Math.round(x.tiempoTotalMs / x.finalizadas) : 0,
  }));

  return arr.sort((a, b) => b.finalizadas - a.finalizadas);
}

function buildTeamTimes(docs = []) {
  return buildTeamProductivity(docs)
    .map((x) => ({
      label: x.label,
      finalizadas: x.finalizadas,
      tiempoPromedioMs: x.tiempoPromedioMs,
      tiempoTotalMs: x.tiempoTotalMs,
    }))
    .sort((a, b) => b.tiempoPromedioMs - a.tiempoPromedioMs);
}

function countActiveUsers(docs = []) {
  const set = new Set();

  for (const d of docs) {
    const starters = Array.isArray(d?.starters) ? d.starters : [];
    for (const s of starters) {
      const hasActivity =
        Number(s?.iniciadasDia || 0) > 0 || Number(s?.finalizadasDia || 0) > 0;

      if (!hasActivity) continue;

      const key = String(s?.starterUid || s?.starter || "").trim();
      if (key) set.add(key);
    }
  }

  return set.size;
}

function countAndenesInUse(docs = []) {
  const set = new Set();

  for (const d of docs) {
    const andenes = Array.isArray(d?.andenes) ? d.andenes : [];
    for (const a of andenes) {
      const acciones = Number(a?.accionesDia || 0);
      const finalizadas = Number(a?.finalizadasDia || 0);
      if (acciones > 0 || finalizadas > 0) {
        set.add(String(a?.idAnden || "—"));
      }
    }
  }

  return set.size;
}

function buildBarData(filterKey, docs = []) {
  if (filterKey === "hoy") {
    return docs.map((d) => ({
      label: d.dayKey?.slice(8, 10) || "—",
      value: Number(d.accionesFinalizadas || 0),
    }));
  }

  if (filterKey === "semana") {
    return docs.map((d) => {
      const dt = new Date(`${d.dayKey}T00:00:00`);
      const label = dt.toLocaleDateString("es-CR", { weekday: "short" });
      return {
        label: label.replace(".", ""),
        value: Number(d.accionesFinalizadas || 0),
      };
    });
  }

  if (filterKey === "mes") {
    const weeks = [];
    for (let i = 0; i < docs.length; i += 7) {
      const chunk = docs.slice(i, i + 7);
      weeks.push({
        label: `S${weeks.length + 1}`,
        value: sum(chunk, (x) => x.accionesFinalizadas),
      });
    }
    return weeks;
  }

  return docs.map((d, idx) => ({
    label: `P${idx + 1}`,
    value: Number(d.accionesFinalizadas || 0),
  }));
}

function buildLineData(filterKey, docs = []) {
  if (!docs.length) return [];

  const rows = docs.map((d, idx) => {
    const iniciadas = Number(d.accionesIniciadas || 0);
    const finalizadas = Number(d.accionesFinalizadas || 0);
    const compliance = iniciadas > 0 ? Math.round((finalizadas / iniciadas) * 100) : 0;

    if (filterKey === "semana") {
      const dt = new Date(`${d.dayKey}T00:00:00`);
      const label = dt.toLocaleDateString("es-CR", { weekday: "short" }).replace(".", "");
      return { label, value: compliance };
    }

    if (filterKey === "mes") {
      return { label: `D${idx + 1}`, value: compliance };
    }

    if (filterKey === "hoy") {
      return { label: d.dayKey?.slice(8, 10) || "—", value: compliance };
    }

    return { label: `C${idx + 1}`, value: compliance };
  });

  if (filterKey === "mes") {
    const chunks = [];
    for (let i = 0; i < rows.length; i += 7) {
      const chunk = rows.slice(i, i + 7);
      const avg = chunk.length
        ? Math.round(sum(chunk, (x) => x.value) / chunk.length)
        : 0;
      chunks.push({ label: `S${chunks.length + 1}`, value: avg });
    }
    return chunks;
  }

  return rows;
}

function buildTypeMix(docs = []) {
  const map = new Map();

  for (const d of docs) {
    const tipos = d?.accionesPorTipo || {};
    for (const key of Object.keys(tipos)) {
      const val = Number(tipos[key] || 0);
      if (!map.has(key)) {
        map.set(key, 0);
      }
      map.set(key, map.get(key) + val);
    }
  }

  const arr = Array.from(map.entries()).map(([label, value]) => ({
    label: label || "—",
    value,
  }));

  const total = arr.reduce((acc, x) => acc + x.value, 0);

  return arr
    .map((x) => ({
      ...x,
      percent: total > 0 ? Math.round((x.value / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function uniqueDayKeysCount(docs = []) {
  const s = new Set();
  for (const d of docs) {
    const k = String(d?.dayKey || "").trim();
    if (k) s.add(k);
  }
  return s.size;
}

function lineComplianceTrend(lineData = []) {
  if (lineData.length < 3) return null;
  const mid = Math.floor(lineData.length / 2);
  const first = lineData.slice(0, mid);
  const second = lineData.slice(mid);
  const avg = (chunk) =>
    chunk.length ? Math.round(sum(chunk, (x) => x.value) / chunk.length) : 0;
  const a = avg(first);
  const b = avg(second);
  const diff = b - a;
  if (Math.abs(diff) < 4) {
    return "El cumplimiento se mantiene relativamente estable entre el inicio y el final del período mostrado.";
  }
  if (diff > 0) {
    return `Tendencia favorable: la segunda mitad del período promedia ~${diff} puntos porcentuales más de cumplimiento que la primera.`;
  }
  return `Atención: la segunda mitad del período promedia ~${Math.abs(diff)} puntos porcentuales menos de cumplimiento que la primera.`;
}

function buildExecutiveSummary({
  label,
  compliance,
  accionesFinalizadas,
  accionesIniciadas,
  accionesCreadas,
  tiempoPromedioMs,
  bultosTotales,
  bultosPorHora,
  horasTotales,
  andenesEnUso,
  lineData,
  barData,
  typeMix,
  docs,
  pendingUsersCount = 0,
}) {
  const tone = getComplianceTone(compliance);
  const diasConCorte = uniqueDayKeysCount(docs);
  const barTotal = sum(barData || [], (x) => x.value);
  const barAvg =
    barData?.length && barTotal > 0
      ? Math.round(barTotal / barData.length)
      : 0;
  const barPeak =
    barData?.length > 0
      ? Math.max(...barData.map((x) => Number(x.value) || 0))
      : 0;

  const headline =
    compliance >= 85
      ? "Operación con cierre sólido frente al volumen iniciado."
      : compliance >= 70
        ? "Operación en zona de mejora: conviene reforzar el cierre de acciones abiertas."
        : "Operación bajo presión: priorizar el cierre de descargas y revisar cuellos de botella.";

  const pillars = [
    {
      title: "Volumen y cierre",
      value: `${fmtInt(accionesFinalizadas)} cerradas`,
      hint: `${fmtInt(accionesIniciadas)} iniciadas · ${fmtInt(accionesCreadas)} creadas`,
    },
    {
      title: "Cumplimiento",
      value: `${compliance}%`,
      hint: "Finalizadas respecto a iniciadas en el período",
    },
    {
      title: "Ritmo de muelle",
      value:
        horasTotales > 0
          ? `${fmtInt(bultosPorHora)} bultos/h`
          : "Sin horas acumuladas",
      hint:
        horasTotales > 0
          ? `${fmtOneDecimal(horasTotales)} h de tiempo de descarga acumulado`
          : "Registre tiempos para estimar throughput",
    },
    {
      title: "Capacidad",
      value: `${fmtInt(andenesEnUso)} andenes activos`,
      hint: `${fmtInt(bultosTotales)} bultos procesados · ${fmtMinutesFromMs(tiempoPromedioMs)} promedio por cierre`,
    },
  ];

  const findings = [];
  if (diasConCorte > 0) {
    findings.push(
      `Se consolidaron métricas sobre ${diasConCorte} día(s) con corte en el período (${label}).`
    );
  }
  if (barData?.length) {
    findings.push(
      `Descargas completadas: total ${fmtInt(barTotal)}, promedio ${fmtInt(barAvg)} por intervalo, pico ${fmtInt(barPeak)}.`
    );
  }
  const trendLine = lineComplianceTrend(lineData || []);
  if (trendLine) findings.push(trendLine);
  const topType = (typeMix || [])[0];
  if (topType && topType.value > 0) {
    findings.push(
      `El tipo de operación «${topType.label}» concentra el ${topType.percent}% del volumen registrado.`
    );
  }

  let recommendedFocus = null;
  if (compliance < 70) {
    recommendedFocus =
      "Priorizar seguimiento de acciones iniciadas sin cierre y validar asignación por andén.";
  } else if (compliance < 85) {
    recommendedFocus =
      "Mantener tablero de pendientes por operador y revisar días con mayor desalineación inicio/cierre.";
  } else if (pendingUsersCount > 0) {
    recommendedFocus =
      "Aun con buen cumplimiento global, hay operadores con iniciadas pendientes de cierre: conviene cerrar el detalle por usuario.";
  } else if (tiempoPromedioMs >= 6 * 60 * 60 * 1000) {
    recommendedFocus =
      "El tiempo promedio de descarga es elevado; revisar procesos o excepciones que alargan el ciclo.";
  } else {
    recommendedFocus =
      "Mantener el ritmo actual y usar el detalle por andén para detectar desvíos tempranos.";
  }

  const metricSnapshot = [
    { label: "Cumplimiento global", value: `${compliance}%` },
    { label: "Descargas cerradas", value: fmtInt(accionesFinalizadas) },
    { label: "Descargas iniciadas", value: fmtInt(accionesIniciadas) },
    { label: "Tiempo promedio", value: fmtMinutesFromMs(tiempoPromedioMs) },
    { label: "Bultos totales", value: fmtInt(bultosTotales) },
    { label: "Bultos / hora (estim.)", value: fmtInt(bultosPorHora) },
  ];

  return {
    headline,
    statusTone: tone,
    periodLabel: label,
    pillars,
    findings,
    recommendedFocus,
    metricSnapshot,
  };
}

function buildAndenesData(docs = []) {
  const map = new Map();

  for (const d of docs) {
    const andenes = Array.isArray(d?.andenes) ? d.andenes : [];

    for (const a of andenes) {
      const key = String(a?.idAnden || "—");

      if (!map.has(key)) {
        map.set(key, {
          label: `Andén ${key}`,
          acciones: 0,
          finalizadas: 0,
          _startersMap: new Map(),
        });
      }

      const row = map.get(key);
      row.acciones += Number(a?.accionesDia || 0);
      row.finalizadas += Number(a?.finalizadasDia || 0);

      // Intenta leer detalle por usuario desde el payload diario del andén.
      const startersRaw = Array.isArray(a?.starters)
        ? a.starters
        : Array.isArray(a?.usuarios)
          ? a.usuarios
          : Array.isArray(a?.operators)
            ? a.operators
            : [];

      for (const s of startersRaw) {
        const starterUid = String(
          s?.starterUid ?? s?.uid ?? s?.userId ?? s?.starter ?? "sin_uid"
        ).trim();
        const starterLabel = String(
          s?.starter ?? s?.displayName ?? s?.nombre ?? s?.userName ?? starterUid
        ).trim();

        const iniciadas = Number(
          s?.iniciadasDia ?? s?.accionesDia ?? s?.iniciadas ?? s?.acciones ?? 0
        );
        const finalizadas = Number(
          s?.finalizadasDia ?? s?.finalizadas ?? s?.cerradas ?? 0
        );

        if (!row._startersMap.has(starterUid)) {
          row._startersMap.set(starterUid, {
            uid: starterUid,
            label: starterLabel || "Usuario",
            iniciadas: 0,
            finalizadas: 0,
          });
        }

        const agg = row._startersMap.get(starterUid);
        agg.iniciadas += iniciadas;
        agg.finalizadas += finalizadas;
      }
    }
  }

  return Array.from(map.values())
    .map((row) => ({
      idAnden: row.label.replace("Andén ", ""),
      label: row.label,
      acciones: row.acciones,
      finalizadas: row.finalizadas,
      starters: Array.from(row._startersMap.values()).sort(
        (a, b) => b.iniciadas - a.iniciadas
      ),
    }))
    .sort((a, b) => b.acciones - a.acciones);
}

function buildDashboardFromDailyDocs(filterKey, docs = [], selectedDate = "") {
  const labelMap = {
    hoy: "Hoy",
    semana: "Semana actual",
    mes: "Mes actual",
    rango: "Rango personalizado",
    fecha: formatSelectedDateLabel(selectedDate),
  };

  const heroBadgeMap = {
    hoy: "Tiempo real",
    semana: "Semanal",
    mes: "Mensual",
    rango: "Personalizado",
    fecha: "Fecha específica",
  };

  const accionesFinalizadas = sum(docs, (d) => d.accionesFinalizadas);
  const accionesIniciadas = sum(docs, (d) => d.accionesIniciadas);
  const accionesCreadas = sum(docs, (d) => d.accionesCreadas);
  const tiempoTotalMs = sum(docs, (d) => d.accionesTiempoTotalMs);

  const tiempoPromedioMs =
    accionesFinalizadas > 0 ? Math.round(tiempoTotalMs / accionesFinalizadas) : 0;

  const andenesEnUso = countAndenesInUse(docs);

  const compliance =
    accionesIniciadas > 0 ? Math.round((accionesFinalizadas / accionesIniciadas) * 100) : 0;

  const { alerts, pendingUsers: pendingUsersCount } = buildAlertsFromDocs({
    compliance,
    tiempoPromedioMs,
    docs,
  });

  const bultosTotales = sum(docs, (d) => d.accionesBultosTotales);
  const bultosPorDescarga =
    accionesFinalizadas > 0 ? Math.round(bultosTotales / accionesFinalizadas) : 0;

  const horasTotales = tiempoTotalMs > 0 ? tiempoTotalMs / 3600000 : 0;
  const bultosPorHora =
    horasTotales > 0 ? Math.round(bultosTotales / horasTotales) : 0;

  const typeMix = buildTypeMix(docs);
  const andenesData = buildAndenesData(docs);

  const teamProductivity = buildTeamProductivity(docs).slice(0, 6);
  const teamTimes = buildTeamTimes(docs).slice(0, 6);

  const barData = buildBarData(filterKey, docs);
  const lineData = buildLineData(filterKey, docs);

  const executiveSummary = buildExecutiveSummary({
    label: labelMap[filterKey] || "Semana actual",
    compliance,
    accionesFinalizadas,
    accionesIniciadas,
    accionesCreadas,
    tiempoPromedioMs,
    bultosTotales,
    bultosPorHora,
    horasTotales,
    andenesEnUso,
    lineData,
    barData,
    typeMix,
    docs,
    pendingUsersCount,
  });

  return {
    label: labelMap[filterKey] || "Semana actual",
    heroBadge: heroBadgeMap[filterKey] || "Semanal",
    compliance,
    accionesCreadas,
    executiveSummary,
    kpis: [
      {
        label: "Descargas completadas",
        value: fmtInt(accionesFinalizadas),
        hint: "Acciones cerradas en el período",
        comparison: `${fmtInt(accionesIniciadas)} iniciadas · ${fmtInt(accionesCreadas)} creadas`,
        tone: "default",
      },
      {
        label: "Tiempo promedio",
        value: fmtMinutesFromMs(tiempoPromedioMs),
        hint: "Promedio desde inicio hasta cierre",
        comparison: `${fmtInt(accionesFinalizadas)} finalizadas`,
        tone: "default",
      },
      {
        label: "Cumplimiento",
        value: `${compliance}%`,
        hint: "Relación entre acciones iniciadas y finalizadas",
        comparison: "Contra objetivo operativo",
        tone: compliance >= 85 ? "good" : compliance >= 70 ? "warn" : "danger",
      },
      {
        label: "Bultos procesados",
        value: fmtInt(bultosTotales),
        hint: "Volumen total registrado en el período",
        comparison: `${fmtInt(bultosPorDescarga)} por descarga`,
        tone: "default",
      },
      {
        label: "Bultos por hora",
        value: fmtInt(bultosPorHora),
        hint: "Eficiencia estimada sobre tiempo acumulado",
        comparison: horasTotales > 0
          ? `${fmtOneDecimal(horasTotales)} h trabajadas`
          : "Sin horas registradas",
        tone: "default",
      },
      {
        label: "Andenes en uso",
        value: `${fmtInt(andenesEnUso)}/9`,
        hint: "Posiciones con actividad registrada",
        comparison: `${fmtInt(accionesIniciadas)} iniciadas · ${fmtInt(accionesCreadas)} creadas`,
        tone: "default",
      },
      {
        kpiKind: "aperturasCreadas",
        label: "Descargas creadas",
        value: fmtInt(accionesCreadas),
        hint: "Acciones de descarga dadas de alta en el período",
        comparison: "Ver listado y estado",
        tone: "default",
      },
    ],
    barData,
    lineData,
    alerts,
    typeMix,
    andenesData,
    teamProductivity,
    teamTimes,
    notes: [
      `Se registran ${fmtInt(accionesFinalizadas)} descargas completadas durante ${labelMap[filterKey] || "el período seleccionado"}.`,
      `El cumplimiento operativo actual se ubica en ${compliance}% sobre ${fmtInt(accionesIniciadas)} acciones iniciadas (${fmtInt(accionesCreadas)} creadas en el período).`,
      `El tiempo promedio de descarga es de ${fmtMinutesFromMs(tiempoPromedioMs)} y el volumen procesado alcanza ${fmtInt(bultosTotales)} bultos.`,
    ],
  };
}

function escapeCsvCell(val) {
  const s = val == null ? "" : String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsvString(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function triggerCsvDownload(filename, csvText) {
  const blob = new Blob(["\uFEFF", csvText], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildMetricaRecepcionExportRows({
  data,
  tenantId,
  company,
  activeFilter,
  selectedDate,
  userEmail,
  userName,
}) {
  const rows = [];
  const push = (cells) => rows.push(cells);
  const blank = () => rows.push([]);

  push(["Métrica Recepción — exportación"]);
  push(["Generado", new Date().toISOString()]);
  push(["Usuario", userName || userEmail || ""]);
  push(["Correo", userEmail || ""]);
  push(["Tenant", tenantId || ""]);
  push(["Company", company || ""]);
  push(["Filtro de período", activeFilter || ""]);
  push(["Fecha (selector)", selectedDate || ""]);
  push(["Vista", data?.label || ""]);
  push(["Badge", data?.heroBadge || ""]);
  blank();
  push(["Resumen ejecutivo"]);
  const ex = data?.executiveSummary;
  if (ex) {
    push(["Titular", ex.headline || ""]);
    push(["Estado", ex.statusTone || ""]);
    if (ex.coverage?.expected) {
      push([
        "Cobertura de cortes",
        `${ex.coverage.withData} de ${ex.coverage.expected} días con registro (${ex.coverage.missing} sin documento)`,
      ]);
    }
    push(["Seguimiento sugerido", ex.recommendedFocus || ""]);
    for (const f of ex.findings || []) {
      push(["Hallazgo", f]);
    }
    for (const p of ex.pillars || []) {
      push(["Pilar", p.title || "", p.value || "", p.hint || ""]);
    }
    for (const s of ex.metricSnapshot || []) {
      push(["Métrica rápida", s.label || "", s.value || ""]);
    }
  } else {
    push(["Titular", ""]);
  }
  blank();
  push(["Cumplimiento global %", String(data?.compliance ?? "")]);
  push(["Acciones creadas (período)", String(data?.accionesCreadas ?? "")]);
  blank();

  push(["Días del período (cortes esperados por filtro)"]);
  push(["dayKey"]);
  for (const dk of data?.periodDayKeysExpected || []) {
    push([dk]);
  }
  blank();

  push(["Cortes con documento en Firestore (dashboard_salud_daily)"]);
  push(["dayKey"]);
  for (const dk of data?.dayKeysWithData || []) {
    push([dk]);
  }
  blank();

  if ((data?.dayKeysSinDatos || []).length > 0) {
    push(["Cortes esperados sin registro diario"]);
    push(["dayKey"]);
    for (const dk of data.dayKeysSinDatos) {
      push([dk]);
    }
    blank();
  }

  push(["Agregados por día (misma fuente que el panel)"]);
  push([
    "dayKey",
    "docId",
    "accionesFinalizadas",
    "accionesIniciadas",
    "accionesCreadas",
    "accionesBultosTotales",
    "accionesTiempoTotalMs",
    "tiempoPromedioDescarga",
  ]);
  for (const row of data?.dailySlice || []) {
    const af = row.accionesFinalizadas;
    const tpMs =
      af > 0 ? Math.round(row.accionesTiempoTotalMs / af) : 0;
    push([
      row.dayKey,
      row.docId,
      String(row.accionesFinalizadas),
      String(row.accionesIniciadas),
      String(row.accionesCreadas),
      String(row.accionesBultosTotales),
      String(row.accionesTiempoTotalMs),
      fmtMinutesFromMs(tpMs),
    ]);
  }
  blank();

  push(["KPIs"]);
  push(["Indicador", "Valor", "Detalle", "Comparación"]);
  for (const k of data?.kpis || []) {
    push([k.label, k.value, k.hint || "", k.comparison || ""]);
  }
  blank();

  push(["Descargas completadas por período (barras)"]);
  push(["Etiqueta", "Valor"]);
  for (const r of data?.barData || []) {
    push([r.label, String(r.value)]);
  }
  blank();

  push(["Cumplimiento por punto (línea)"]);
  push(["Etiqueta", "Cumplimiento %"]);
  for (const r of data?.lineData || []) {
    push([r.label, String(r.value)]);
  }
  blank();

  push(["Mix por tipo de operación"]);
  push(["Tipo", "Cantidad", "Porcentaje %"]);
  for (const r of data?.typeMix || []) {
    push([r.label, String(r.value), String(r.percent ?? "")]);
  }
  blank();

  push(["Andenes"]);
  push(["Andén", "Acciones", "Finalizadas"]);
  for (const a of data?.andenesData || []) {
    push([a.label, String(a.acciones), String(a.finalizadas)]);
  }
  blank();

  push(["Detalle por usuario — andenes"]);
  push(["Andén", "Usuario", "Iniciadas", "Finalizadas"]);
  for (const a of data?.andenesData || []) {
    const starters = Array.isArray(a.starters) ? a.starters : [];
    for (const s of starters) {
      push([
        a.label,
        s.label || s.uid || "—",
        String(s.iniciadas ?? ""),
        String(s.finalizadas ?? ""),
      ]);
    }
  }
  blank();

  push(["Productividad por usuario"]);
  push([
    "Usuario",
    "Iniciadas",
    "Finalizadas",
    "Bultos",
    "Tiempo promedio",
    "Tiempo total",
  ]);
  for (const t of data?.teamProductivity || []) {
    push([
      t.label || "—",
      String(t.iniciadas ?? ""),
      String(t.finalizadas ?? ""),
      String(t.bultos ?? ""),
      fmtMinutesFromMs(t.tiempoPromedioMs),
      fmtMinutesFromMs(t.tiempoTotalMs),
    ]);
  }
  blank();

  push(["Tiempos por usuario (ordenados)"]);
  push(["Usuario", "Finalizadas", "Tiempo promedio", "Tiempo total"]);
  for (const t of data?.teamTimes || []) {
    push([
      t.label || "—",
      String(t.finalizadas ?? ""),
      fmtMinutesFromMs(t.tiempoPromedioMs),
      fmtMinutesFromMs(t.tiempoTotalMs),
    ]);
  }
  blank();

  push(["Alertas"]);
  push(["Tono", "Título", "Descripción"]);
  for (const al of data?.alerts || []) {
    push([al.tone || "", al.title || "", al.description || ""]);
  }
  blank();

  push(["Notas"]);
  push(["Texto"]);
  for (const n of data?.notes || []) {
    push([n]);
  }

  return rows;
}

function FilterTabs({
  active,
  onChange,
  selectedDate,
  onChangeDate,
  onExport,
  onExportExcel,
  exportDisabled,
}) {
  const filters = [
    { key: "hoy", label: "Hoy", hint: "Corte diario" },
    { key: "semana", label: "Semana", hint: "Vista semanal" },
    { key: "mes", label: "Mes", hint: "Vista mensual" },
    { key: "rango", label: "Rango personalizado", hint: "Últimos cortes" },
    { key: "fecha", label: "Por fecha", hint: "Seleccionar día" },
  ];

  return (
    <div style={ui.filtersBar}>
      <div style={ui.filtersWrap}>
        {filters.map((filter) => {
          const selected = active === filter.key;

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onChange(filter.key)}
              style={{
                ...ui.filterBtn,
                ...(selected ? ui.filterBtnActive : {}),
              }}
            >
              <span style={ui.filterBtnLabel}>{filter.label}</span>
              <span
                style={{
                  ...ui.filterBtnHint,
                  ...(selected ? ui.filterBtnHintActive : {}),
                }}
              >
                {filter.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div style={ui.filtersActions}>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            onChangeDate(e.target.value);
            onChange("fecha");
          }}
          style={ui.dateInput}
          aria-label="Seleccionar fecha"
        />
        <button
          type="button"
          style={{
            ...ui.exportBtn,
            ...(exportDisabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
          }}
          title={
            exportDisabled
              ? "Espera a que carguen las métricas o corrige el error"
              : "Descargar reporte en CSV (UTF-8)"
          }
          disabled={!!exportDisabled}
          onClick={() => {
            if (!exportDisabled && typeof onExport === "function") onExport();
          }}
        >
          <span style={ui.btnInlineIcon}>
            <TrendingUp size={16} strokeWidth={2.2} />
            CSV
          </span>
        </button>
        <button
          type="button"
          style={{
            ...ui.exportBtnExcel,
            ...(exportDisabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
          }}
          title={
            exportDisabled
              ? "Espera a que carguen las métricas o corrige el error"
              : "Descargar informe Excel con gráficos, tablas y estilos"
          }
          disabled={!!exportDisabled}
          onClick={() => {
            if (!exportDisabled && typeof onExportExcel === "function") {
              onExportExcel();
            }
          }}
        >
          <span style={ui.btnInlineIcon}>
            <FileSpreadsheet size={16} strokeWidth={2.2} />
            Excel
          </span>
        </button>
      </div>
    </div>
  );
}

function ExecutiveSummaryPanel({ summary }) {
  if (!summary?.headline) return null;

  const tone = summary.statusTone || "default";
  const shell =
    tone === "good"
      ? ui.execSummaryShellGood
      : tone === "warn"
        ? ui.execSummaryShellWarn
        : tone === "danger"
          ? ui.execSummaryShellDanger
          : ui.execSummaryShell;

  const cov = summary.coverage;

  return (
    <div style={{ ...ui.execSummaryCard, ...shell }}>
      <div style={ui.execSummaryHeader}>
        <div>
          <div style={ui.execSummaryKicker}>Resumen ejecutivo</div>
          <div style={ui.execSummaryHeadline}>{summary.headline}</div>
          <div style={ui.execSummaryPeriod}>
            Alcance: <b>{summary.periodLabel}</b>
            {cov?.expected ? (
              <>
                {" "}
                · Cobertura de cortes: <b>{cov.withData}</b> de <b>{cov.expected}</b> días esperados
                {cov.missing > 0 ? (
                  <span style={ui.execSummaryWarnInline}>
                    {" "}
                    ({cov.missing} sin documento diario)
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <span style={ui.execSummaryStatusBadge}>
          {tone === "good" ? "En objetivo" : tone === "warn" ? "Observar" : "Priorizar acción"}
        </span>
      </div>

      <div style={ui.execSummaryPillars}>
        {(summary.pillars || []).map((p) => (
          <div key={p.title} style={ui.execSummaryPillar}>
            <div style={ui.execSummaryPillarTitle}>{p.title}</div>
            <div style={ui.execSummaryPillarValue}>{p.value}</div>
            <div style={ui.execSummaryPillarHint}>{p.hint}</div>
          </div>
        ))}
      </div>

      <div style={ui.execSummaryBody}>
        <div style={ui.execSummaryCol}>
          <div style={ui.execSummaryColTitle}>Hallazgos</div>
          <ul style={ui.execSummaryList}>
            {(summary.findings || []).map((t, i) => (
              <li key={i} style={ui.execSummaryLi}>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div style={ui.execSummaryCol}>
          <div style={ui.execSummaryColTitle}>Seguimiento sugerido</div>
          <p style={ui.execSummaryFocus}>{summary.recommendedFocus}</p>
          <div style={ui.execSummaryColTitle}>Lectura rápida</div>
          <div style={ui.snapshotGrid}>
            {(summary.metricSnapshot || []).map((m) => (
              <div key={m.label} style={ui.snapshotCell}>
                <div style={ui.snapshotLabel}>{m.label}</div>
                <div style={ui.snapshotValue}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({ data = [], periodLabel = "Semana actual" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const avg = data.length && total > 0 ? Math.round(total / data.length) : 0;
  const peak = data.length ? Math.max(...data.map((d) => Number(d.value) || 0)) : 0;

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Descargas por período</div>
          <div style={ui.chartSubtitle}>
            Acciones completadas por intervalo · {periodLabel}
          </div>
          {data.length > 0 && (
            <div style={ui.chartMetaRow}>
              Total <b>{fmtInt(total)}</b>
              <span style={ui.chartMetaSep}>·</span>
              Promedio <b>{fmtInt(avg)}</b>
              <span style={ui.chartMetaSep}>·</span>
              Pico <b>{fmtInt(peak)}</b>
            </div>
          )}
        </div>
        <span style={ui.chartBadge}>Operación</span>
      </div>

      <div style={ui.barChartPanel}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos para graficar.</div>
        ) : (
          <>
            <div style={ui.barGridBg} aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={ui.barGridLine} />
              ))}
            </div>
            <div style={ui.barChartWrap}>
              {data.map((item) => (
                <div key={item.label} style={ui.barItem}>
                  <div
                    style={{
                      ...ui.bar,
                      height: `${Math.max((item.value / max) * 118, 10)}px`,
                    }}
                    title={`${item.label}: ${fmtInt(item.value)} descargas`}
                  />
                  <div style={ui.barValue}>{fmtInt(item.value)}</div>
                  <div style={ui.barLabel} title={String(item.label)}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniLineChart({ data = [], periodLabel = "Últimos cortes" }) {
  const lineGradId = useId().replace(/:/g, "");
  const w = 100;
  const h = 44;
  const padT = 6;
  const padB = 4;
  const chartH = h - padT - padB;

  const nums = data.map((d) => Math.max(0, Math.min(100, Number(d.value) || 0)));
  const avg =
    nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  const minV = nums.length ? Math.min(...nums) : 0;
  const maxV = nums.length ? Math.max(...nums) : 0;
  const refY = padT + (1 - 85 / 100) * chartH;

  const linePts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const v = Math.max(0, Math.min(100, Number(d.value) || 0));
    const y = padT + (1 - v / 100) * chartH;
    return { x, y };
  });
  const linePoints = linePts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints =
    linePts.length > 0
      ? `0,${padT + chartH} ${linePts.map((p) => `${p.x},${p.y}`).join(" ")} ${w},${padT + chartH}`
      : "";

  const compactLegend = data.length > 8;

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Cumplimiento operativo</div>
          <div style={ui.chartSubtitle}>
            Finalizadas ÷ iniciadas por intervalo (0–100%) · {periodLabel}
          </div>
          {data.length > 0 && (
            <div style={ui.chartMetaRow}>
              Mín. <b>{minV}%</b>
              <span style={ui.chartMetaSep}>·</span>
              Prom. <b>{avg}%</b>
              <span style={ui.chartMetaSep}>·</span>
              Máx. <b>{maxV}%</b>
              <span style={ui.chartMetaSep}>·</span>
              <span style={ui.lineRefHint}>Línea punteada: objetivo 85%</span>
            </div>
          )}
        </div>
        <span style={ui.chartBadge}>Seguimiento</span>
      </div>

      <div style={ui.lineChartWrap}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin tendencia disponible.</div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={ui.lineSvg}>
            <line
              x1="0"
              y1={refY}
              x2={w}
              y2={refY}
              stroke="#94A3B8"
              strokeWidth="0.35"
              strokeDasharray="2 2"
              opacity={0.9}
            />
            <polygon
              fill={`url(#${lineGradId})`}
              points={areaPoints}
              opacity={0.92}
            />
            <defs>
              <linearGradient id={lineGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(8,159,138,0.22)" />
                <stop offset="100%" stopColor="rgba(8,159,138,0.02)" />
              </linearGradient>
            </defs>
            <polyline
              fill="none"
              stroke={ACCENT}
              strokeWidth="1.1"
              points={linePoints}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.map((d, i) => {
              const x = (i / Math.max(data.length - 1, 1)) * w;
              const v = Math.max(0, Math.min(100, Number(d.value) || 0));
              const y = padT + (1 - v / 100) * chartH;
              return (
                <circle key={`${d.label}-${i}`} cx={x} cy={y} r="1.1" fill="#fff" stroke={ACCENT} strokeWidth="0.45" />
              );
            })}
          </svg>
        )}
      </div>

      {!compactLegend && data.length > 0 ? (
        <div style={ui.lineLegend}>
          {data.map((d) => (
            <div key={d.label} style={ui.legendItem}>
              <span style={ui.legendDot} />
              <span style={ui.legendText}>
                {d.label}: {d.value}%
              </span>
            </div>
          ))}
        </div>
      ) : data.length > 0 ? (
        <div style={ui.lineLegendCompact}>
          {data.length} puntos en el período · use el Excel para el detalle tabular.
        </div>
      ) : null}
    </div>
  );
}

function DonutPlaceholder({
  value = 84,
  label = "Cumplimiento operativo",
  subtitle = "Descargas cerradas dentro del estándar",
}) {
  const angle = Math.max(0, Math.min(360, (value / 100) * 360));

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>{label}</div>
          <div style={ui.chartSubtitle}>{subtitle}</div>
        </div>
        <span style={ui.chartBadge}>Control</span>
      </div>

      <div style={ui.donutWrap}>
        <div
          style={{
            ...ui.donut,
            background: `conic-gradient(${ACCENT} 0deg ${angle}deg, #E7E9F2 ${angle}deg 360deg)`,
          }}
        >
          <div style={ui.donutInner}>
            <div style={ui.donutValue}>{value}%</div>
            <div style={ui.donutText}>Actual</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniUserChart({ data = [], periodLabel = "Semana actual" }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Productividad por usuario</div>
          <div style={ui.chartSubtitle}>
            Acciones cerradas por operador · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Equipo</span>
      </div>

      <div style={ui.userList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos de usuarios para el período.</div>
        ) : (
          data.map((item) => (
            <div key={item.label} style={ui.userRow}>
              <div style={ui.userRowTop}>
                <div style={ui.userRowName}>{item.label}</div>
                <div style={ui.userRowValue}>{item.value}</div>
              </div>

              <div style={ui.userTrack}>
                <div
                  style={{
                    ...ui.userFill,
                    width: `${Math.max((item.value / max) * 100, 8)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MixTypeChart({ data = [], periodLabel = "" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const totalMix = data.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Mix de operación</div>
          <div style={ui.chartSubtitle}>
            Distribución por tipo de acción · {periodLabel}
          </div>
          {data.length > 0 && (
            <div style={ui.chartMetaRow}>
              Acciones tipificadas: <b>{fmtInt(totalMix)}</b>
              <span style={ui.chartMetaSep}>·</span>
              {data.length} categorías
            </div>
          )}
        </div>
        <span style={ui.chartBadge}>Tipo</span>
      </div>

      <div style={ui.mixList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos disponibles.</div>
        ) : (
          data.map((item) => (
            <div key={item.label} style={ui.mixRow}>
              <div style={ui.mixRowTop}>
                <div style={ui.mixLabel}>{item.label}</div>
                <div style={ui.mixValue}>
                  {fmtInt(item.value)} · {item.percent}%
                </div>
              </div>

              <div style={ui.mixTrack}>
                <div
                  style={{
                    ...ui.mixFill,
                    width: `${Math.max((item.value / max) * 100, 6)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AndenesChart({ data = [], periodLabel = "", onOpenDetalleAnden }) {
  const max = Math.max(...data.map((d) => d.acciones), 1);

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Uso de andenes</div>
          <div style={ui.chartSubtitle}>
            Actividad operativa por posición · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Infraestructura</span>
      </div>

      <div style={ui.mixList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos disponibles.</div>
        ) : (
          data.map((item) => (
            <div key={item.label} style={ui.mixRow}>
              <div style={ui.mixRowTop}>
                <div style={ui.mixLabel}>{item.label}</div>
                <div style={ui.mixValueWrap}>
                  <div style={ui.mixValue}>
                    {item.acciones} acc · {item.finalizadas} fin
                  </div>
                  <button
                    type="button"
                    style={{
                      ...ui.kpiEyeBtn,
                    }}
                    title="Ver operadores del andén"
                    onClick={() => onOpenDetalleAnden?.(item)}
                  >
                    <Eye size={16} strokeWidth={2.2} color={ACCENT} />
                  </button>
                </div>
              </div>

              <div style={ui.mixTrack}>
                <div
                  style={{
                    ...ui.mixFill,
                    width: `${Math.max((item.acciones / max) * 100, 6)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TeamProductivityCard({ data = [], periodLabel = "" }) {
  const max = Math.max(...data.map((d) => d.finalizadas), 1);

  return (
    <div style={ui.teamCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Productividad por usuario</div>
          <div style={ui.chartSubtitle}>
            Cierres, volumen y ritmo de ejecución · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Equipo</span>
      </div>

      <div style={ui.teamList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos de usuarios para el período.</div>
        ) : (
          data.map((item) => (
            <div key={item.label} style={ui.teamRow}>
              <div style={ui.teamRowTop}>
                <div>
                  <div style={ui.teamName}>{item.label}</div>
                  <div style={ui.teamMeta}>
                    {fmtInt(item.finalizadas)} cerradas · {fmtInt(item.iniciadas)} iniciadas
                  </div>
                </div>

                <div style={ui.teamValueBox}>
                  <div style={ui.teamValue}>{fmtInt(item.bultos)}</div>
                  <div style={ui.teamValueLabel}>bultos</div>
                </div>
              </div>

              <div style={ui.teamTrack}>
                <div
                  style={{
                    ...ui.teamFill,
                    width: `${Math.max((item.finalizadas / max) * 100, 6)}%`,
                  }}
                />
              </div>

              <div style={ui.teamFoot}>
                <span>Tiempo promedio: {fmtMinutesFromMs(item.tiempoPromedioMs)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TeamTimesCard({ data = [], periodLabel = "" }) {
  const valid = data.filter((d) => Number(d.tiempoPromedioMs || 0) > 0);
  const max = Math.max(...valid.map((d) => d.tiempoPromedioMs), 1);

  return (
    <div style={ui.teamCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Tiempos por usuario</div>
          <div style={ui.chartSubtitle}>
            Comparativo de duración promedio por operador · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Tiempo</span>
      </div>

      <div style={ui.teamList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin tiempos registrados para el período.</div>
        ) : (
          data.map((item) => {
            const width =
              item.tiempoPromedioMs > 0
                ? `${Math.max((item.tiempoPromedioMs / max) * 100, 6)}%`
                : "6%";

            return (
              <div key={item.label} style={ui.teamRow}>
                <div style={ui.teamRowTop}>
                  <div>
                    <div style={ui.teamName}>{item.label}</div>
                    <div style={ui.teamMeta}>
                      {fmtInt(item.finalizadas)} cerradas
                    </div>
                  </div>

                  <div style={ui.teamTimeValue}>
                    {item.tiempoPromedioMs > 0
                      ? fmtMinutesFromMs(item.tiempoPromedioMs)
                      : "—"}
                  </div>
                </div>

                <div style={ui.teamTrack}>
                  <div
                    style={{
                      ...ui.teamFillSoft,
                      width,
                    }}
                  />
                </div>

                <div style={ui.teamFoot}>
                  <span>Total acumulado: {fmtMinutesFromMs(item.tiempoTotalMs)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MetricaRecepcion() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const isMobile = useIsMobile();
  const [activeFilter, setActiveFilter] = useState("hoy");
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [noDataMessage, setNoDataMessage] = useState("");
  const [tenantScope, setTenantScope] = useState({ tenantId: "", company: "" });
  const [aperturasModalOpen, setAperturasModalOpen] = useState(false);
  const [aperturasModalLoading, setAperturasModalLoading] = useState(false);
  const [aperturasModalItems, setAperturasModalItems] = useState([]);
  const [aperturasModalError, setAperturasModalError] = useState("");
  const [aperturasFilterEstado, setAperturasFilterEstado] = useState("Todos");
  const [aperturasFilterAnden, setAperturasFilterAnden] = useState("");
  const [aperturasFilterDesde, setAperturasFilterDesde] = useState("");
  const [aperturasFilterHasta, setAperturasFilterHasta] = useState("");
  const [panelInfoModalOpen, setPanelInfoModalOpen] = useState(false);
  const [alertsMonitoreoOpen, setAlertsMonitoreoOpen] = useState(false);
  const [executiveSummaryOpen, setExecutiveSummaryOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [excludedAndenUsers, setExcludedAndenUsers] = useState([]);
  const [minAndenStartedActions, setMinAndenStartedActions] = useState(1);
  const [andenUsersCatalog, setAndenUsersCatalog] = useState([]);
  const [showUsersCatalog, setShowUsersCatalog] = useState(false);
  const [usersCatalogLoading, setUsersCatalogLoading] = useState(false);
  const [usersCatalogError, setUsersCatalogError] = useState("");
  const [andenSettingsHydrated, setAndenSettingsHydrated] = useState(false);
  const [excludedAndenUserDraft, setExcludedAndenUserDraft] = useState("");
  const [andenDetalleModal, setAndenDetalleModal] = useState({
    open: false,
    item: null,
    loading: false,
    error: "",
    starters: [],
  });

  useEffect(() => {
    try {
      const rawNew = localStorage.getItem(ANDEN_SETTINGS_KEY);
      if (rawNew) {
        const parsed = JSON.parse(rawNew);
        const list = Array.isArray(parsed?.excludedUsers)
          ? parsed.excludedUsers
          : [];
        const clean = list.map((x) => String(x || "").trim()).filter(Boolean);
        const minN = Math.max(
          0,
          Number.isFinite(Number(parsed?.minStartedActions))
            ? Math.floor(Number(parsed.minStartedActions))
            : 1
        );
        setExcludedAndenUsers(clean);
        setMinAndenStartedActions(minN);
      } else {
        // Migración desde la versión vieja (solo lista negra).
        const rawLegacy = localStorage.getItem(EXCLUDED_ANDEN_USERS_LEGACY_KEY);
        if (rawLegacy) {
          const parsedLegacy = JSON.parse(rawLegacy);
          const clean = Array.isArray(parsedLegacy)
            ? parsedLegacy.map((x) => String(x || "").trim()).filter(Boolean)
            : [];
          setExcludedAndenUsers(clean);
          setMinAndenStartedActions(1);
        }
      }
    } catch (e) {
      console.warn("No se pudo leer configuración local de usuarios excluidos.", e);
    } finally {
      setAndenSettingsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!andenSettingsHydrated) return;
    try {
      localStorage.setItem(ANDEN_SETTINGS_KEY, JSON.stringify({
        excludedUsers: excludedAndenUsers,
        minStartedActions: minAndenStartedActions,
      }));
    } catch (e) {
      console.warn("No se pudo guardar configuración local de usuarios excluidos.", e);
    }
  }, [excludedAndenUsers, minAndenStartedActions, andenSettingsHydrated]);

  const excludedAndenUsersSet = useMemo(
    () => new Set(excludedAndenUsers.map(normalizeExcludedUserToken).filter(Boolean)),
    [excludedAndenUsers]
  );
  const minAndenStartedActionsSafe = Math.max(
    0,
    Number.isFinite(Number(minAndenStartedActions))
      ? Math.floor(Number(minAndenStartedActions))
      : 0
  );

  useEffect(() => {
    if (!aperturasModalOpen) return;
    setAperturasFilterEstado("Todos");
    setAperturasFilterAnden("");
    setAperturasFilterDesde("");
    setAperturasFilterHasta("");
  }, [aperturasModalOpen]);

  const aperturasModalFiltered = useMemo(() => {
    const desde = startOfDayDate(parseYMD(aperturasFilterDesde));
    const hasta = endOfDayDate(parseYMD(aperturasFilterHasta));
    const anden = String(aperturasFilterAnden || "").trim();
    const estFilter = aperturasFilterEstado;

    return aperturasModalItems.filter((row) => {
      if (estFilter !== "Todos") {
        if (getAccionEstadoRecepcion(row) !== estFilter) return false;
      }
      if (anden) {
        const a = String(row?.idAnden ?? "").trim();
        if (a !== anden) return false;
      }
      const d = toDateSafe(row?.creadoAt);
      if (!d) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    });
  }, [
    aperturasModalItems,
    aperturasFilterEstado,
    aperturasFilterAnden,
    aperturasFilterDesde,
    aperturasFilterHasta,
  ]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "auto";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  const currentData = useMemo(() => {
    return (
      dashboardData || {
        label: "Cargando",
        heroBadge: "Sin datos",
        compliance: 0,
        accionesCreadas: 0,
        kpis: [
          {
            label: "Descargas completadas",
            value: "0",
            hint: "Acciones cerradas en el período",
            comparison: "Ej. 4 iniciadas · 7 creadas",
            tone: "default",
          },
          {
            label: "Tiempo promedio",
            value: "0 min",
            hint: "Promedio desde inicio hasta cierre",
            comparison: "—",
            tone: "default",
          },
          {
            label: "Cumplimiento",
            value: "0%",
            hint: "Relación entre acciones iniciadas y finalizadas",
            comparison: "—",
            tone: "default",
          },
          {
            label: "Bultos procesados",
            value: "0",
            hint: "Volumen total registrado en el período",
            comparison: "—",
            tone: "default",
          },
          {
            label: "Bultos por hora",
            value: "0",
            hint: "Eficiencia estimada sobre tiempo acumulado",
            comparison: "—",
            tone: "default",
          },
          {
            label: "Andenes en uso",
            value: "0/9",
            hint: "Posiciones con actividad registrada",
            comparison: "Ej. 4 iniciadas · 7 creadas",
            tone: "default",
          },
          {
            kpiKind: "aperturasCreadas",
            label: "Aperturas creadas",
            value: "0",
            hint: "Acciones de descarga dadas de alta en el período",
            comparison: "Ej. ver listado",
            tone: "default",
          },
        ],
        barData: [],
        lineData: [],
        userData: [],
        alerts: [
          {
            tone: "default",
            title: "Sin alertas",
            description: "No hay información suficiente para evaluar el estado operativo.",
          },
        ],
        typeMix: [],
        andenesData: [],
        teamProductivity: [],
        teamTimes: [],
        notes: loadError
          ? [loadError]
          : ["Todavía no hay información disponible para el período seleccionado."],
      }
    );
  }, [dashboardData, loadError]);

  const handleExportReport = useCallback(() => {
    if (loadingData || loadError || !dashboardData) return;
    const rows = buildMetricaRecepcionExportRows({
      data: dashboardData,
      tenantId: tenantScope.tenantId,
      company: tenantScope.company,
      activeFilter,
      selectedDate,
      userEmail: user?.email || "",
      userName: user?.displayName || "",
    });
    const csv = rowsToCsvString(rows);
    const safeFilter = String(activeFilter || "periodo").replace(/[^\w-]/g, "_");
    const safeDate = String(selectedDate || "fecha").replace(/[^\d-]/g, "");
    triggerCsvDownload(
      `metrica-recepcion_${safeFilter}_${safeDate}_${Date.now()}.csv`,
      csv
    );
  }, [
    loadingData,
    loadError,
    dashboardData,
    tenantScope.tenantId,
    tenantScope.company,
    activeFilter,
    selectedDate,
    user?.email,
    user?.displayName,
  ]);

  const handleExportExcel = useCallback(async () => {
    if (loadingData || loadError || !dashboardData) return;
    try {
      const buffer = await buildMetricaRecepcionExcelProBuffer(dashboardData, {
        tenantId: tenantScope.tenantId,
        company: tenantScope.company,
        activeFilter,
        selectedDate,
        userEmail: user?.email || "",
        userName: user?.displayName || "",
      });
      const safeFilter = String(activeFilter || "periodo").replace(/[^\w-]/g, "_");
      const safeDate = String(selectedDate || "fecha").replace(/[^\d-]/g, "");
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metrica-recepcion_${safeFilter}_${safeDate}_${Date.now()}.xlsx`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("handleExportExcel:", e);
      window.alert(
        "No se pudo generar el archivo Excel. Revisa la consola o inténtalo de nuevo."
      );
    }
  }, [
    loadingData,
    loadError,
    dashboardData,
    tenantScope.tenantId,
    tenantScope.company,
    activeFilter,
    selectedDate,
    user?.email,
    user?.displayName,
  ]);

  const addExcludedAndenUser = () => {
    const raw = String(excludedAndenUserDraft || "").trim();
    const normalized = normalizeExcludedUserToken(raw);
    if (!normalized) return;
    const exists = excludedAndenUsers.some(
      (item) => normalizeExcludedUserToken(item) === normalized
    );
    if (exists) {
      setExcludedAndenUserDraft("");
      return;
    }
    setExcludedAndenUsers((prev) => [...prev, raw]);
    setExcludedAndenUserDraft("");
  };

  const removeExcludedAndenUser = (value) => {
    const normalized = normalizeExcludedUserToken(value);
    setExcludedAndenUsers((prev) =>
      prev.filter((item) => normalizeExcludedUserToken(item) !== normalized)
    );
  };

  const mergeAndenUsersCatalog = (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    setAndenUsersCatalog((prev) => {
      const map = new Map(
        prev.map((item) => [normalizeExcludedUserToken(item.uid || item.label), item])
      );
      for (const row of rows) {
        const uid = String(row?.uid || "").trim();
        const label = String(row?.label || "").trim();
        const key = normalizeExcludedUserToken(uid || label);
        if (!key) continue;
        map.set(key, {
          uid: uid || "sin_uid",
          label: label || uid || "Usuario",
        });
      }
      return Array.from(map.values()).sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "es", { sensitivity: "base" })
      );
    });
  };

  const isCatalogUserExcluded = (item) => {
    const uidKey = normalizeExcludedUserToken(item?.uid);
    const nameKey = normalizeExcludedUserToken(item?.label);
    return excludedAndenUsersSet.has(uidKey) || excludedAndenUsersSet.has(nameKey);
  };

  const toggleCatalogUserBlacklist = (item) => {
    const preferred = String(item?.uid || "").trim() || String(item?.label || "").trim();
    if (!preferred) return;
    if (isCatalogUserExcluded(item)) {
      removeExcludedAndenUser(preferred);
      if (preferred !== item?.label) removeExcludedAndenUser(item?.label);
      return;
    }
    setExcludedAndenUsers((prev) => {
      const normalizedPreferred = normalizeExcludedUserToken(preferred);
      const exists = prev.some(
        (x) => normalizeExcludedUserToken(x) === normalizedPreferred
      );
      if (exists) return prev;
      return [...prev, preferred];
    });
  };

  const loadUsersCatalog = async () => {
    if (!tenantScope.tenantId || !tenantScope.company) {
      setUsersCatalogError("No se pudo determinar el tenant para filtrar usuarios.");
      return;
    }
    try {
      setUsersCatalogLoading(true);
      setUsersCatalogError("");

      const q = query(
        collection(db, "accion_descarga"),
        orderBy("creadoAt", "desc"),
        limit(2500)
      );
      const snap = await getDocs(q);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantScope.tenantId,
        tenantScope.company
      );

      const detected = rows.map((row) => {
        const who = actionStarterIdentity(row);
        return {
          uid: who.uid || "sin_uid",
          label: who.label || "Usuario",
        };
      });

      mergeAndenUsersCatalog(detected);
      setShowUsersCatalog(true);
    } catch (e) {
      console.error("loadUsersCatalog:", e);
      setUsersCatalogError("No se pudo cargar la lista de usuarios.");
    } finally {
      setUsersCatalogLoading(false);
    }
  };

  const openAndenDetalle = async (item) => {
    if (!item) return;
    if (!tenantScope.tenantId || !tenantScope.company) {
      setAndenDetalleModal({
        open: true,
        item,
        loading: false,
        error: "No se pudo determinar el tenant para cargar el detalle.",
        starters: [],
      });
      return;
    }

    const initialStarters = (Array.isArray(item.starters) ? item.starters : []).filter(
      (starter) => {
        const uidKey = normalizeExcludedUserToken(starter?.uid);
        const nameKey = normalizeExcludedUserToken(starter?.label);
        return (
          Number(starter?.iniciadas || 0) >= minAndenStartedActionsSafe &&
          !excludedAndenUsersSet.has(uidKey) &&
          !excludedAndenUsersSet.has(nameKey)
        );
      }
    );

    setAndenDetalleModal({
      open: true,
      item,
      loading: true,
      error: "",
      starters: initialStarters,
    });

    try {
      const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate);
      const allowed = new Set(dayKeys);
      const andenId = String(item?.idAnden || item?.label?.replace("Andén ", "") || "").trim();

      const q = query(
        collection(db, "accion_descarga"),
        orderBy("creadoAt", "desc"),
        limit(1500)
      );
      const snap = await getDocs(q);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantScope.tenantId,
        tenantScope.company
      );

      const filtered = rows.filter((row) => {
        const rowAnden = String(row?.idAnden ?? "").trim();
        if (!rowAnden || rowAnden !== andenId) return false;
        const dt = toDateSafe(row?.creadoAt);
        if (!dt) return false;
        return allowed.has(ymd(dt));
      });

      const grouped = new Map();
      for (const row of filtered) {
        const who = actionStarterIdentity(row);
        if (!grouped.has(who.uid)) {
          grouped.set(who.uid, {
            uid: who.uid,
            label: who.label,
            iniciadas: 0,
            finalizadas: 0,
          });
        }
        const agg = grouped.get(who.uid);
        // "Iniciadas" se contabiliza por acciones que pasaron por inicio.
        agg.iniciadas += row?.startedAt ? 1 : 0;
        // Finalizadas por acción cerrada.
        agg.finalizadas += row?.completedAt || row?.completeAt ? 1 : 0;
      }

      const startersRaw = Array.from(grouped.values());
      mergeAndenUsersCatalog(startersRaw);

      const starters = startersRaw
        .filter((starter) => {
          const uidKey = normalizeExcludedUserToken(starter.uid);
          const nameKey = normalizeExcludedUserToken(starter.label);
          return (
            Number(starter.iniciadas || 0) >= minAndenStartedActionsSafe &&
            !excludedAndenUsersSet.has(uidKey) &&
            !excludedAndenUsersSet.has(nameKey)
          );
        })
        .sort((a, b) => b.iniciadas - a.iniciadas);

      setAndenDetalleModal((prev) => ({
        ...prev,
        loading: false,
        starters,
      }));
    } catch (e) {
      console.error("openAndenDetalle:", e);
      setAndenDetalleModal((prev) => ({
        ...prev,
        loading: false,
        error: "No se pudo cargar el detalle por usuario para este andén.",
      }));
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        setLoadingData(true);
        setLoadError("");
        setNoDataMessage("");

        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
          if (!mounted) return;
          setDashboardData(null);
          setLoadingData(false);
          setLoadError("No hay usuario autenticado.");
          return;
        }

        const profileSnap = await getDoc(doc(db, "profiles", currentUser.uid));
        const profile = profileSnap.exists() ? profileSnap.data() || {} : {};

        const tenantId = String(profile?.tenantId || "").trim();
        const company = String(profile?.company || "").trim();
        setTenantScope({ tenantId, company });

        if (!tenantId || !company) {
          if (!mounted) return;
          setDashboardData(null);
          setLoadingData(false);
          setLoadError("El perfil no tiene tenantId o company.");
          return;
        }

        const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate);

        const q = query(
          collection(db, "dashboard_salud_daily"),
          where("tenantId", "==", tenantId),
          where("company", "==", company),
          orderBy("dayKey", "asc")
        );

        const snap = await getDocs(q);

        const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filteredDocs = allDocs.filter((d) => dayKeys.includes(d.dayKey));

        const built = buildDashboardFromDailyDocs(
          activeFilter,
          filteredDocs,
          selectedDate
        );

        const withData = new Set(
          filteredDocs
            .map((d) => String(d.dayKey || "").trim())
            .filter(Boolean)
        );
        built.periodDayKeysExpected = [...dayKeys];
        built.dayKeysWithData = [...withData].sort();
        built.dayKeysSinDatos = dayKeys.filter((k) => !withData.has(k));
        if (built.executiveSummary) {
          built.executiveSummary = {
            ...built.executiveSummary,
            coverage:
              dayKeys.length > 0
                ? {
                    expected: dayKeys.length,
                    withData: withData.size,
                    missing: built.dayKeysSinDatos.length,
                  }
                : null,
          };
        }
        built.dailySlice = filteredDocs
          .slice()
          .sort((a, b) =>
            String(a.dayKey || "").localeCompare(String(b.dayKey || ""))
          )
          .map((d) => ({
            dayKey: String(d.dayKey || ""),
            docId: String(d.id || ""),
            accionesFinalizadas: Number(d.accionesFinalizadas || 0),
            accionesIniciadas: Number(d.accionesIniciadas || 0),
            accionesCreadas: Number(d.accionesCreadas || 0),
            accionesBultosTotales: Number(d.accionesBultosTotales || 0),
            accionesTiempoTotalMs: Number(d.accionesTiempoTotalMs || 0),
          }));

        if (!filteredDocs.length) {
          const msg =
            activeFilter === "fecha"
              ? `No hay operaciones registradas para la fecha ${formatSelectedDateLabel(selectedDate)}.`
              : activeFilter === "hoy"
                ? "Aún no se registran operaciones hoy."
                : "Todavía no hay operaciones registradas para este período.";

          built.notes = [msg];

          if (mounted) {
            setNoDataMessage(msg);
          }
        }

        if (!mounted) return;
        setDashboardData(built);
        setLoadingData(false);
      } catch (error) {
        console.error("loadDashboard error:", error);
        if (!mounted) return;
        setDashboardData(null);
        setLoadingData(false);
        setLoadError("No se pudieron cargar las métricas.");
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [activeFilter, selectedDate]);

  useEffect(() => {
    if (!aperturasModalOpen) return;
    if (!tenantScope.tenantId || !tenantScope.company) {
      setAperturasModalItems([]);
      setAperturasModalError("No se pudo determinar el tenant para cargar la lista.");
      setAperturasModalLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setAperturasModalLoading(true);
      setAperturasModalError("");
      try {
        const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate);
        const allowed = new Set(dayKeys);
        const q = query(
          collection(db, "accion_descarga"),
          orderBy("creadoAt", "desc"),
          limit(1500)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const rows = filterByUserScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          tenantScope.tenantId,
          tenantScope.company
        );
        const filtered = rows.filter((it) => {
          const dt = toDateSafe(it?.creadoAt);
          if (!dt) return false;
          return allowed.has(ymd(dt));
        });
        setAperturasModalItems(filtered);
      } catch (e) {
        console.error("aperturasModal load:", e);
        if (!cancelled) setAperturasModalError("No se pudo cargar el listado.");
      } finally {
        if (!cancelled) setAperturasModalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    aperturasModalOpen,
    activeFilter,
    selectedDate,
    tenantScope.tenantId,
    tenantScope.company,
  ]);

  const m = isMobile;

  return (
    <div style={{ ...ui.shell, ...(m ? ui.mShell : {}) }}>
      <style>{`
        @keyframes metricaRecepcionSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <header style={{ ...ui.topbar, ...(m ? ui.mTopbar : {}) }}>
        <div style={{ ...ui.topbarInner, ...(m ? ui.mTopbarInner : {}) }}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => nav("/recepcion")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/recepcion")}
          >
            <div style={ui.brandMark}>
              <BarChart3 size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Recepción</div>
              <div style={ui.brandSub}>Panel de métricas</div>
            </div>
          </div>

          <div style={{ ...ui.topbarRight, ...(m ? ui.mTopbarRight : {}) }}>
            <div style={{ ...ui.userBox, ...(m ? ui.mUserBox : {}) }}>
              <div style={ui.userAvatar}>
                <User size={16} strokeWidth={2.2} />
              </div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
                <div style={ui.userMail}>{user?.email || "—"}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => nav("/recepcion")}
              style={{ ...ui.btnGhost, ...(m ? ui.mBtnGhost : {}) }}
            >
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Volver a recepción
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              style={{ ...ui.btnGhost, ...(m ? ui.mBtnGhost : {}) }}
              title="Configuración del panel"
            >
              <span style={ui.btnInlineIcon}>
                <Settings size={16} strokeWidth={2.2} />
                Configuración
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={{ ...ui.main, ...(m ? ui.mMain : {}) }}>
        <div style={{ ...ui.container, ...(m ? ui.mContainer : {}) }}>
          {loadingData && (
            <div style={ui.infoBanner}>
              <span style={ui.btnInlineIcon}>
                <Loader2
                  size={18}
                  strokeWidth={2.2}
                  style={{ animation: "metricaRecepcionSpin 0.7s linear infinite" }}
                />
                Cargando métricas…
              </span>
            </div>
          )}

          {!!loadError && !loadingData && (
            <div style={ui.errorBanner}>
              {loadError}
            </div>
          )}
          {!!noDataMessage && !loadingData && !loadError && (
            <div style={ui.noDataBanner}>
              {noDataMessage}
            </div>
          )}
          <div style={{ ...ui.heroCompact, ...(m ? ui.mHeroCompact : {}) }}>
            <h1 style={{ ...ui.title, margin: 0 }}>Panel de Recepción</h1>
            <button
              type="button"
              style={{ ...ui.heroInfoBtn, ...(m ? ui.mHeroInfoBtn : {}) }}
              onClick={() => setPanelInfoModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={panelInfoModalOpen}
            >
              <Info size={18} strokeWidth={2.25} color={ACCENT} />
              Cómo funciona el panel
            </button>
          </div>

          <div style={{ ...ui.stickyFiltersOnly, ...(m ? ui.mStickyFiltersOnly : {}) }}>
            <div style={ui.filtersPanel}>
              <div style={ui.filtersPanelTop}>
                <div style={ui.filtersPanelInfo}>
                  <div style={ui.filtersPanelTitle}>Período de análisis</div>
                  <div style={ui.filtersPanelText}>
                    Cambia la vista para revisar el comportamiento operativo por día, semana o mes.
                  </div>
                </div>

                <div style={ui.filtersPanelMeta}>
                  Vista activa: <b>{currentData.label}</b>
                </div>
              </div>

              <FilterTabs
                active={activeFilter}
                onChange={setActiveFilter}
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                onExport={handleExportReport}
                onExportExcel={handleExportExcel}
                exportDisabled={loadingData || !!loadError || !dashboardData}
              />
            </div>
          </div>

          <div style={{ ...ui.stickyKpisOnly, ...(m ? ui.mStickyKpisOnly : {}) }}>
            <div style={ui.kpiPanel}>
              <div style={ui.kpiPanelTop}>
                <div style={ui.kpiPanelInfo}>
                  <div style={ui.kpiPanelTitle}>Indicadores y lectura ejecutiva</div>
                  <div style={ui.kpiPanelText}>
                    Síntesis narrativa del período e indicadores numéricos para ritmo, cumplimiento y capacidad.
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: m ? "column" : "row",
                    alignItems: m ? "stretch" : "flex-end",
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    style={{ ...ui.alertsToggleBtn, ...(m ? { alignSelf: "stretch", justifyContent: "center" } : {}) }}
                    onClick={() => setExecutiveSummaryOpen((o) => !o)}
                    aria-expanded={executiveSummaryOpen}
                    aria-controls="recepcion-resumen-ejecutivo-panel"
                    id="recepcion-resumen-ejecutivo-toggle"
                  >
                    {executiveSummaryOpen ? (
                      <>
                        Ocultar resumen ejecutivo
                        <ChevronUp size={16} strokeWidth={2.5} color={ACCENT} />
                      </>
                    ) : (
                      <>
                        Mostrar resumen ejecutivo
                        <ChevronDown size={16} strokeWidth={2.5} color={ACCENT} />
                      </>
                    )}
                  </button>
                  <div style={ui.kpiPanelMeta}>
                    Corte activo: <b>{currentData.label}</b>
                  </div>
                </div>
              </div>

              {executiveSummaryOpen && (
                <div id="recepcion-resumen-ejecutivo-panel" role="region" aria-labelledby="recepcion-resumen-ejecutivo-toggle">
                  <ExecutiveSummaryPanel summary={currentData.executiveSummary} />
                </div>
              )}

              <div style={{ ...ui.kpiGrid, ...(m ? ui.mKpiGrid : {}) }}>
                {currentData.kpis.map((item) => {
                  const isAperturas = item.kpiKind === "aperturasCreadas";
                  return (
                    <div
                      key={item.kpiKind || item.label}
                      style={{
                        ...ui.kpiCard,
                        ...(item.tone === "good"
                          ? ui.kpiCardGood
                          : item.tone === "warn"
                            ? ui.kpiCardWarn
                            : item.tone === "danger"
                              ? ui.kpiCardDanger
                              : {}),
                      }}
                    >
                      <div style={ui.kpiCardTop}>
                        <div style={ui.kpiLabel}>{item.label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isAperturas && (
                            <button
                              type="button"
                              onClick={() => setAperturasModalOpen(true)}
                              style={ui.kpiEyeBtn}
                              aria-label="Ver aperturas creadas y estado"
                              title="Ver detalle"
                            >
                              <Eye size={18} strokeWidth={2.25} color={ACCENT} />
                            </button>
                          )}
                          <div
                            style={{
                              ...ui.kpiToneDot,
                              ...(item.tone === "good"
                                ? ui.kpiToneDotGood
                                : item.tone === "warn"
                                  ? ui.kpiToneDotWarn
                                  : item.tone === "danger"
                                    ? ui.kpiToneDotDanger
                                    : {}),
                            }}
                          />
                        </div>
                      </div>

                      <div style={ui.kpiValue}>{item.value}</div>
                      <div style={ui.kpiMeta}>{item.hint}</div>
                      <div
                        style={{
                          ...ui.kpiHint,
                          ...(item.tone === "good"
                            ? ui.kpiHintGood
                            : item.tone === "warn"
                              ? ui.kpiHintWarn
                              : item.tone === "danger"
                                ? ui.kpiHintDanger
                                : {}),
                        }}
                      >
                        {item.comparison}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Monitoreo</div>
            <div style={ui.alertsTitleRow}>
              <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>Alertas y estado operativo</div>
              <button
                type="button"
                style={{ ...ui.alertsToggleBtn, ...(m ? ui.mAlertsToggleBtn : {}) }}
                onClick={() => setAlertsMonitoreoOpen((o) => !o)}
                aria-expanded={alertsMonitoreoOpen}
                aria-controls="recepcion-alertas-panel"
                id="recepcion-alertas-toggle"
              >
                {alertsMonitoreoOpen ? (
                  <>
                    Ocultar
                    <ChevronUp size={16} strokeWidth={2.5} color={ACCENT} />
                  </>
                ) : (
                  <>
                    Mostrar alertas
                    <ChevronDown size={16} strokeWidth={2.5} color={ACCENT} />
                  </>
                )}
              </button>
            </div>
            {alertsMonitoreoOpen && (
              <>
                <div style={ui.sectionText}>
                  Señales rápidas para detectar desvíos, pendientes y estado general del flujo operativo.
                </div>
                <div style={ui.alertsGrid} id="recepcion-alertas-panel" role="region" aria-labelledby="recepcion-alertas-toggle">
                  <div style={ui.alertCard}>
                    <div style={ui.alertCardHeader}>
                      <div>
                        <div style={ui.alertCardTitle}>Alertas operativas</div>
                        <div style={ui.alertCardSubtitle}>
                          Indicadores que requieren seguimiento o validación.
                        </div>
                      </div>
                      <span style={ui.alertCardBadge}>Monitoreo</span>
                    </div>

                    <div style={ui.alertList}>
                      {currentData.alerts.map((alert, idx) => (
                        <div
                          key={`${alert.title}-${idx}`}
                          style={{
                            ...ui.alertItem,
                            ...(alert.tone === "good"
                              ? ui.alertItemGood
                              : alert.tone === "warn"
                                ? ui.alertItemWarn
                                : alert.tone === "danger"
                                  ? ui.alertItemDanger
                                  : {}),
                          }}
                        >
                          <div
                            style={{
                              ...ui.alertIcon,
                              ...(alert.tone === "good"
                                ? ui.alertIconGood
                                : alert.tone === "warn"
                                  ? ui.alertIconWarn
                                  : alert.tone === "danger"
                                    ? ui.alertIconDanger
                                    : {}),
                            }}
                          >
                            {alert.tone === "good" ? (
                              <CheckCircle2 size={18} strokeWidth={2.25} />
                            ) : alert.tone === "warn" ? (
                              <AlertTriangle size={18} strokeWidth={2.25} />
                            ) : alert.tone === "danger" ? (
                              <AlertTriangle size={18} strokeWidth={2.25} />
                            ) : (
                              <Info size={18} strokeWidth={2.25} />
                            )}
                          </div>

                          <div style={ui.alertBody}>
                            <div style={ui.alertTitle}>{alert.title}</div>
                            <div style={ui.alertDescription}>{alert.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverlineLg}>Analítica</div>
          </div>

          <div style={{ ...ui.chartGrid, ...(m ? ui.mChartGrid : {}) }}>
            <MiniBarChart data={currentData.barData} periodLabel={currentData.label} />
            <MiniLineChart data={currentData.lineData} periodLabel={currentData.label} />
            <MixTypeChart data={currentData.typeMix} periodLabel={currentData.label} />
            <AndenesChart
              data={currentData.andenesData}
              periodLabel={currentData.label}
              onOpenDetalleAnden={openAndenDetalle}
            />
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Equipo</div>
            <div style={ui.sectionTitle}>Desempeño del equipo</div>
            <div style={ui.sectionText}>
              Comparativo de productividad y tiempos promedio por operador para el período seleccionado.
            </div>
          </div>

          <div style={{ ...ui.teamGrid, ...(m ? ui.mTeamGrid : {}) }}>
            <TeamProductivityCard
              data={currentData.teamProductivity}
              periodLabel={currentData.label}
            />

            <TeamTimesCard
              data={currentData.teamTimes}
              periodLabel={currentData.label}
            />
          </div>

          <div style={ui.bottomCard}>
            <div style={ui.bottomTop}>
              <div>
                <div style={ui.bottomEyebrow}>Cierre ejecutivo</div>
                <div style={ui.bottomTitle}>Observaciones del período</div>
              </div>

              <div style={ui.bottomBadge}>{currentData.label}</div>
            </div>

            <div style={ui.bottomText}>
              Resumen automático de los principales indicadores registrados para el período seleccionado.
            </div>

            <div style={ui.noteList}>
              {currentData.notes.map((item, idx) => (
                <div key={`${item}-${idx}`} style={ui.noteItem}>
                  <span style={ui.noteDot} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {settingsModalOpen && (
        <div
          style={ui.aperturasModalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recepcion-settings-modal-title"
        >
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setSettingsModalOpen(false)}
            aria-label="Cerrar"
          />

          <div style={ui.infoHelpSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="recepcion-settings-modal-title" style={ui.aperturasSheetTitle}>
                  Configuración del panel
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Ajustes locales de visualización para métricas de recepción.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            <div style={ui.settingsSection}>
              <div style={ui.settingsTitle}>Usuarios excluidos: Uso de andenes</div>
              <div style={ui.settingsText}>
                Agregá nombre o UID a una lista negra para que no aparezcan en el detalle del ojito por andén.
              </div>
              <div style={ui.settingsWarningText}>
                Esta lista es definitiva: todo usuario agregado aquí quedará oculto en los listados del ojito.
              </div>

              <div style={ui.settingsRowCompact}>
                <label style={ui.aperturasFilterField}>
                  <span style={ui.aperturasFilterLabel}>Mínimo de acciones iniciadas</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={minAndenStartedActionsSafe}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = raw === "" ? 0 : Number(raw);
                      if (!Number.isFinite(next)) return;
                      setMinAndenStartedActions(Math.max(0, Math.floor(next)));
                    }}
                    style={ui.settingsInput}
                  />
                </label>
              </div>

              <div style={ui.settingsRow}>
                <input
                  type="text"
                  value={excludedAndenUserDraft}
                  onChange={(e) => setExcludedAndenUserDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExcludedAndenUser();
                    }
                  }}
                  placeholder="Ej: Juan Pérez o UID"
                  style={ui.settingsInput}
                />
                <button
                  type="button"
                  onClick={addExcludedAndenUser}
                  style={ui.settingsAddBtn}
                >
                  Agregar
                </button>
              </div>

              <div style={ui.settingsRowCompact}>
                <button
                  type="button"
                  onClick={() => {
                    if (!showUsersCatalog && andenUsersCatalog.length === 0) {
                      void loadUsersCatalog();
                    } else if (!showUsersCatalog) {
                      setShowUsersCatalog(true);
                    } else {
                      setShowUsersCatalog(false);
                    }
                  }}
                  style={ui.settingsShowUsersBtn}
                >
                  {usersCatalogLoading
                    ? "Cargando usuarios…"
                    : showUsersCatalog
                      ? "Ocultar usuarios"
                      : "Mostrar usuarios"}
                </button>
              </div>

              {usersCatalogError ? (
                <div style={ui.settingsError}>{usersCatalogError}</div>
              ) : null}

              {showUsersCatalog && andenUsersCatalog.length > 0 ? (
                <div style={ui.settingsCatalogBox}>
                  <div style={ui.settingsCatalogTitle}>Usuarios detectados (selección rápida)</div>
                  <div style={ui.settingsCatalogList}>
                    {andenUsersCatalog.map((item) => {
                      const excluded = isCatalogUserExcluded(item);
                      return (
                        <div key={`${item.uid}-${item.label}`} style={ui.settingsCatalogItem}>
                          <div style={{ minWidth: 0 }}>
                            <div style={ui.settingsListText}>{item.label}</div>
                            <div style={ui.settingsCatalogSub}>UID: {item.uid || "—"}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleCatalogUserBlacklist(item)}
                            style={
                              excluded
                                ? ui.settingsTagExcluded
                                : ui.settingsTagInclude
                            }
                          >
                            {excluded ? "En lista negra" : "Excluir"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {excludedAndenUsers.length === 0 ? (
                <div style={ui.settingsEmpty}>Sin usuarios excluidos.</div>
              ) : (
                <div style={ui.settingsList}>
                  {excludedAndenUsers.map((item) => (
                    <div key={item} style={ui.settingsListItem}>
                      <span style={ui.settingsListText}>{item}</span>
                      <button
                        type="button"
                        onClick={() => removeExcludedAndenUser(item)}
                        style={ui.settingsRemoveBtn}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {panelInfoModalOpen && (
        <div
          style={ui.aperturasModalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recepcion-info-modal-title"
        >
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setPanelInfoModalOpen(false)}
            aria-label="Cerrar"
          />

          <div style={ui.infoHelpSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="recepcion-info-modal-title" style={ui.aperturasSheetTitle}>
                  Información del panel
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Contexto del corte y glosario de indicadores (se actualiza con el período activo).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelInfoModalOpen(false)}
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            <div style={{ display: "grid", gap: 16, overflow: "auto", maxHeight: "min(70vh, 560px)", paddingRight: 4 }}>
              <div style={ui.heroMain}>
                <div style={ui.kickerRow}>
                  <span style={ui.kickerDot} />
                  <div style={ui.kicker}>Analítica operativa</div>
                  <span style={{ ...ui.badge, ...ui.badgeInline }}>
                    <BarChart3 size={12} strokeWidth={2.5} style={{ marginRight: 5, flexShrink: 0 }} />
                    {currentData.heroBadge}
                  </span>
                </div>

                <p style={ui.subtitle}>
                  Visualiza el desempeño de la operación en un solo lugar: volumen procesado,
                  tiempos de ejecución, ocupación de andenes y productividad del equipo.
                </p>

                <div style={ui.heroChips}>
                  <div style={ui.heroChip}>Seguimiento diario</div>
                  <div style={ui.heroChip}>Indicadores por período</div>
                  <div style={ui.heroChip}>Enfoque operativo</div>
                </div>
              </div>

              <div style={ui.heroNote}>
                <div style={ui.heroNoteTop}>
                  <div>
                    <div style={ui.heroNoteEyebrow}>Corte seleccionado</div>
                    <div style={ui.heroNoteTitle}>{currentData.label}</div>
                  </div>
                  <div style={ui.heroNoteBadge}>{currentData.heroBadge}</div>
                </div>

                <div style={ui.heroNoteText}>
                  Revisa el estado general de la operación para el período activo.
                </div>

                <div style={ui.heroMiniList}>
                  <div style={ui.heroMiniItem}>
                    <span style={ui.heroMiniDot} />
                    Descargas cerradas = acciones finalizadas
                  </div>
                  <div style={ui.heroMiniItem}>
                    <span style={ui.heroMiniDot} />
                    Tiempo promedio = duración desde inicio hasta cierre
                  </div>
                  <div style={ui.heroMiniItem}>
                    <span style={ui.heroMiniDot} />
                    Usuarios activos = operadores con movimiento registrado
                  </div>
                  <div style={ui.heroMiniItem}>
                    <span style={ui.heroMiniDot} />
                    Andenes en uso = posiciones con actividad operativa
                  </div>
                </div>
              </div>

              <div style={ui.infoModalSection}>
                <div style={ui.sectionOverline}>Control</div>
                <div style={ui.sectionTitle}>Filtros de visualización</div>
                <div style={ui.sectionText}>
                  Selecciona el período de análisis para actualizar los indicadores y las gráficas del panel. Los
                  controles de período siguen visibles debajo del título principal.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {andenDetalleModal.open && (
        <div
          style={ui.aperturasModalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anden-detalle-modal-title"
        >
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() =>
              setAndenDetalleModal({
                open: false,
                item: null,
                loading: false,
                error: "",
                starters: [],
              })
            }
            aria-label="Cerrar"
          />

          <div style={ui.aperturasSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="anden-detalle-modal-title" style={ui.aperturasSheetTitle}>
                  {andenDetalleModal.item?.label || "Andén"}
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Usuarios que iniciaron acciones · <b>{currentData.label}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setAndenDetalleModal({
                    open: false,
                    item: null,
                    loading: false,
                    error: "",
                    starters: [],
                  })
                }
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            {andenDetalleModal.loading ? (
              <div style={ui.aperturasModalLoadingBox}>
                <Loader2
                  size={22}
                  strokeWidth={2.25}
                  color={ACCENT}
                  style={{ animation: "metricaRecepcionSpin 0.75s linear infinite" }}
                />
                <span style={{ color: "#64748B", fontWeight: 800, fontSize: 13 }}>
                  Cargando…
                </span>
              </div>
            ) : andenDetalleModal.error ? (
              <div style={ui.aperturasModalEmpty}>{andenDetalleModal.error}</div>
            ) : !andenDetalleModal.starters?.length ? (
              <div style={ui.aperturasModalEmpty}>
                No se encontraron inicios de acciones por usuario para este andén en el período seleccionado.
              </div>
            ) : (
              <div style={ui.aperturasListWrap}>
                <div style={ui.aperturasList}>
                  {andenDetalleModal.starters.map((starter) => (
                    <div
                      key={`${andenDetalleModal.item.label}-${starter.uid}`}
                      style={ui.aperturasRow}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={ui.aperturasRowTitle}>{starter.label}</div>
                        <div style={ui.aperturasRowMeta}>
                          UID: {starter.uid || "—"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...ui.estadoPill, ...ui.estadoPillProceso }}>
                          {starter.iniciadas} iniciadas
                        </span>
                        <span style={{ ...ui.estadoPill, ...ui.estadoPillCompleta }}>
                          {starter.finalizadas} finalizadas
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {aperturasModalOpen && (
        <div style={ui.aperturasModalRoot} role="dialog" aria-modal="true" aria-labelledby="aperturas-modal-title">
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setAperturasModalOpen(false)}
            aria-label="Cerrar"
          />

          <div style={ui.aperturasSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="aperturas-modal-title" style={ui.aperturasSheetTitle}>
                  Aperturas creadas
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Acciones de descarga en <b>{currentData.label}</b> · fecha de alta
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAperturasModalOpen(false)}
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            {aperturasModalLoading ? (
              <div style={ui.aperturasModalLoadingBox}>
                <Loader2 size={22} strokeWidth={2.25} color={ACCENT} style={{ animation: "metricaRecepcionSpin 0.75s linear infinite" }} />
                <span style={{ color: "#64748B", fontWeight: 800, fontSize: 13 }}>Cargando…</span>
              </div>
            ) : aperturasModalError ? (
              <div style={ui.aperturasModalEmpty}>{aperturasModalError}</div>
            ) : aperturasModalItems.length === 0 ? (
              <div style={ui.aperturasModalEmpty}>No hay acciones de descarga en este período.</div>
            ) : (
              <>
                <div style={ui.aperturasFiltersWrap}>
                  <div style={ui.aperturasFiltersRow}>
                    <label style={ui.aperturasFilterField}>
                      <span style={ui.aperturasFilterLabel}>Desde</span>
                      <input
                        type="date"
                        value={aperturasFilterDesde}
                        onChange={(e) => setAperturasFilterDesde(e.target.value)}
                        style={ui.aperturasFilterInput}
                      />
                    </label>
                    <label style={ui.aperturasFilterField}>
                      <span style={ui.aperturasFilterLabel}>Hasta</span>
                      <input
                        type="date"
                        value={aperturasFilterHasta}
                        onChange={(e) => setAperturasFilterHasta(e.target.value)}
                        style={ui.aperturasFilterInput}
                      />
                    </label>
                  </div>
                  <div style={ui.aperturasFiltersRow}>
                    <label style={ui.aperturasFilterField}>
                      <span style={ui.aperturasFilterLabel}>Estado</span>
                      <select
                        value={aperturasFilterEstado}
                        onChange={(e) => setAperturasFilterEstado(e.target.value)}
                        style={ui.aperturasFilterSelect}
                      >
                        <option value="Todos">Todos</option>
                        <option value="Creada">Creada</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Completa">Completa</option>
                      </select>
                    </label>
                    <label style={ui.aperturasFilterField}>
                      <span style={ui.aperturasFilterLabel}>Andén</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={aperturasFilterAnden}
                        onChange={(e) => setAperturasFilterAnden(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="Ej. 3"
                        style={ui.aperturasFilterInput}
                      />
                    </label>
                  </div>
                  {(aperturasFilterEstado !== "Todos" ||
                    aperturasFilterAnden.trim() ||
                    aperturasFilterDesde ||
                    aperturasFilterHasta) && (
                    <button
                      type="button"
                      style={ui.aperturasFilterClear}
                      onClick={() => {
                        setAperturasFilterEstado("Todos");
                        setAperturasFilterAnden("");
                        setAperturasFilterDesde("");
                        setAperturasFilterHasta("");
                      }}
                    >
                      Limpiar filtros
                    </button>
                  )}
                  <div style={ui.aperturasFilterHint}>
                    Mostrando {aperturasModalFiltered.length} de {aperturasModalItems.length}
                  </div>
                </div>

                <div style={ui.aperturasListWrap}>
                  {aperturasModalFiltered.length === 0 ? (
                    <div style={ui.aperturasModalEmpty}>
                      Ningún resultado con los filtros aplicados.
                    </div>
                  ) : (
                    <div style={ui.aperturasList}>
                      {aperturasModalFiltered.map((row) => {
                        const est = getAccionEstadoRecepcion(row);
                        const title =
                          String(row?.nombreAccion || "").trim() ||
                          [row?.proveedorNombre, row?.idAnden ? `Andén ${row.idAnden}` : ""]
                            .filter(Boolean)
                            .join(" · ") ||
                          row?.id;
                        const estStyle =
                          est === "Completa"
                            ? ui.estadoPillCompleta
                            : est === "En proceso"
                              ? ui.estadoPillProceso
                              : ui.estadoPillCreada;
                        return (
                          <div key={row.id} style={ui.aperturasRow}>
                            <div style={{ minWidth: 0 }}>
                              <div style={ui.aperturasRowTitle}>{title}</div>
                              <div style={ui.aperturasRowMeta}>
                                Alta {formatDateTimeShort(row?.creadoAt)}
                                {row?.aperturaId ? ` · Apertura ${row.aperturaId}` : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <span style={{ ...ui.estadoPill, ...estStyle }}>{est}</span>
                              <button
                                type="button"
                                style={ui.aperturasRowLink}
                                onClick={() => {
                                  setAperturasModalOpen(false);
                                  nav(`/recepcion/accion-descarga/${encodeURIComponent(row.id)}`);
                                }}
                              >
                                Abrir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
    zIndex: 100,
  },

  topbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
  },
  brandTitle: { fontWeight: 950, fontSize: 14, color: "#0F172A" },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },

  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#0F172A",
    boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },

  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "18px 16px 28px",
    WebkitOverflowScrolling: "touch",
  },

  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 16,
    paddingBottom: 8,
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: 18,
    alignItems: "start",
    paddingTop: 4,
  },

  heroCompact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    paddingTop: 8,
    paddingBottom: 4,
  },

  heroInfoBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(8,159,138,0.28)",
    background: ACCENT_SOFT,
    color: "#0F172A",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 6px 16px rgba(15,23,42,0.06)",
  },

  kickerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  kickerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 3px rgba(8,159,138,0.2)",
  },
  kicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 800,
    padding: "5px 11px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },
  badgeInline: {
    display: "inline-flex",
    alignItems: "center",
  },

  title: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 30px)",
    fontWeight: 950,
    letterSpacing: -0.4,
    lineHeight: 1.12,
    color: "#0F172A",
  },

  subtitle: {
    margin: 0,
    color: SLATE,
    fontWeight: 650,
    lineHeight: 1.5,
    fontSize: 14,
    maxWidth: 560,
  },

  heroNote: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    border: "1px solid #E7E9F2",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    alignContent: "start",
    gap: 12,
  },

  heroNoteTitle: {
    fontWeight: 980,
    fontSize: 22,
    lineHeight: 1.1,
    color: "#0F172A",
  },

  heroNoteText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.5,
  },

  heroMiniList: {
    display: "grid",
    gap: 10,
    marginTop: 2,
  },

  heroMiniItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.35,
  },

  heroMiniDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    flexShrink: 0,
  },

  sectionHeaderBlock: {
    display: "grid",
    gap: 4,
    marginTop: 8,
    marginBottom: 6,
  },

  alertsTitleRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },

  alertsToggleBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(8,159,138,0.28)",
    background: ACCENT_SOFT,
    color: "#0F172A",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
  },

  sectionTitle: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 2,
  },

  sectionText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.35,
  },

  stickyFiltersOnly: {
    position: "sticky",
    top: 0,
    zIndex: 90,
    background: "#F6F7FB",
    paddingTop: 6,
    paddingBottom: 12,
    boxShadow: "0 1px 0 rgba(15,23,42,0.06)",
  },

  stickyKpisOnly: {
    position: "relative",
    zIndex: 80,
    background: "#F6F7FB",
    paddingBottom: 10,
  },

  filtersBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },

  filtersWrap: {
    display: "flex",
    alignItems: "stretch",
    gap: 10,
    flexWrap: "wrap",
    padding: 0,
    background: "transparent",
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
    flex: 1,
  },

  filterBtn: {
    border: "1px solid #DDE3EE",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 18,
    padding: "12px 14px",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
    transition: "all 120ms ease",
    display: "grid",
    gap: 4,
    minWidth: 132,
    textAlign: "left",
  },

  filterBtnActive: {
    background: "#F1FBF8",
    color: ACCENT,
    border: "1px solid rgba(8,159,138,0.35)",
    boxShadow: "0 10px 24px rgba(8,159,138,0.10)",
    transform: "translateY(-1px)",
  },

  exportBtn: {
    border: "1px solid rgba(8,159,138,0.24)",
    background: "#F1FBF8",
    color: ACCENT,
    borderRadius: 12,
    padding: "9px 14px",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "0 4px 14px rgba(8,159,138,0.10)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },

  exportBtnExcel: {
    border: "1px solid #D7DCE5",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 12,
    padding: "9px 14px",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
    gap: 12,
    padding: 0,
  },

  kpiCard: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
    minHeight: 124,
    display: "grid",
    alignContent: "start",
  },

  kpiLabel: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 13,
  },

  kpiValue: {
    color: "#0F172A",
    fontWeight: 990,
    fontSize: 30,
    lineHeight: 1.05,
    marginBottom: 10,
    letterSpacing: -0.6,
  },

  kpiMeta: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.4,
    marginBottom: 8,
  },

  kpiHint: {
    color: ACCENT,
    fontWeight: 900,
    fontSize: 12,
    lineHeight: 1.35,
  },

  kpiPanel: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 24,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
  },

  kpiPanelTop: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },

  kpiPanelInfo: {
    display: "grid",
    gap: 4,
  },

  kpiPanelTitle: {
    fontWeight: 980,
    fontSize: 15,
    color: "#0F172A",
  },

  kpiPanelText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.45,
  },

  kpiPanelMeta: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  execSummaryCard: {
    borderRadius: 20,
    padding: 18,
    display: "grid",
    gap: 14,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 100%)",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  },

  execSummaryShell: {},

  execSummaryShellGood: {
    border: "1px solid rgba(22,163,74,0.22)",
    background: "linear-gradient(145deg, #FFFFFF 0%, #F7FEF9 100%)",
  },

  execSummaryShellWarn: {
    border: "1px solid rgba(217,119,6,0.22)",
    background: "linear-gradient(145deg, #FFFFFF 0%, #FFFAF5 100%)",
  },

  execSummaryShellDanger: {
    border: "1px solid rgba(220,38,38,0.22)",
    background: "linear-gradient(145deg, #FFFFFF 0%, #FFF7F7 100%)",
  },

  execSummaryHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },

  execSummaryKicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.06,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },

  execSummaryHeadline: {
    fontSize: "clamp(16px, 2.6vw, 19px)",
    fontWeight: 950,
    color: "#0F172A",
    lineHeight: 1.35,
    maxWidth: 720,
  },

  execSummaryPeriod: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 750,
    color: "#64748B",
    lineHeight: 1.45,
  },

  execSummaryWarnInline: {
    color: "#B45309",
    fontWeight: 800,
  },

  execSummaryStatusBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    color: "#334155",
    fontWeight: 900,
    fontSize: 11,
    flexShrink: 0,
    alignSelf: "flex-start",
  },

  execSummaryPillars: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
    gap: 10,
  },

  execSummaryPillar: {
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid #E7E9F2",
    display: "grid",
    gap: 4,
    minHeight: 86,
  },

  execSummaryPillarTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.04,
  },

  execSummaryPillarValue: {
    fontSize: 16,
    fontWeight: 950,
    color: "#0F172A",
    lineHeight: 1.2,
  },

  execSummaryPillarHint: {
    fontSize: 11,
    fontWeight: 750,
    color: "#64748B",
    lineHeight: 1.35,
  },

  execSummaryBody: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 16,
    alignItems: "start",
  },

  execSummaryCol: {
    display: "grid",
    gap: 8,
  },

  execSummaryColTitle: {
    fontSize: 12,
    fontWeight: 950,
    color: "#0F172A",
  },

  execSummaryList: {
    margin: 0,
    paddingLeft: 18,
    color: "#475569",
    fontWeight: 750,
    fontSize: 13,
    lineHeight: 1.5,
  },

  execSummaryLi: {
    marginBottom: 6,
  },

  execSummaryFocus: {
    margin: 0,
    color: "#0F172A",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.5,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(8,159,138,0.06)",
    border: "1px solid rgba(8,159,138,0.12)",
  },

  snapshotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },

  snapshotCell: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
  },

  snapshotLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.04,
    marginBottom: 4,
  },

  snapshotValue: {
    fontSize: 15,
    fontWeight: 950,
    color: "#0F172A",
  },

  kpiCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },

  kpiToneDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#CBD5E1",
    flexShrink: 0,
  },

  kpiToneDotGood: {
    background: "#16A34A",
    boxShadow: "0 0 0 4px rgba(22,163,74,0.10)",
  },

  kpiToneDotWarn: {
    background: "#D97706",
    boxShadow: "0 0 0 4px rgba(217,119,6,0.10)",
  },

  kpiToneDotDanger: {
    background: "#DC2626",
    boxShadow: "0 0 0 4px rgba(220,38,38,0.10)",
  },

  kpiCardGood: {
    border: "1px solid rgba(22,163,74,0.18)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F7FEF9 100%)",
  },

  kpiCardWarn: {
    border: "1px solid rgba(217,119,6,0.18)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FFFAF5 100%)",
  },

  kpiCardDanger: {
    border: "1px solid rgba(220,38,38,0.18)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FFF7F7 100%)",
  },

  kpiHintGood: {
    color: "#15803D",
  },

  kpiHintWarn: {
    color: "#B45309",
  },

  kpiHintDanger: {
    color: "#B91C1C",
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 14,
    alignItems: "stretch",
  },

  chartCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    minHeight: 270,
    display: "grid",
    alignContent: "start",
    borderTop: `3px solid ${ACCENT_SOFT}`,
  },

  chartHeader: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },

  chartTitle: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },

  chartSubtitle: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 1.35,
  },

  chartBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 900,
    fontSize: 11,
    whiteSpace: "nowrap",
  },

  chartMetaRow: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 750,
    color: "#64748B",
    lineHeight: 1.4,
  },

  chartMetaSep: {
    margin: "0 6px",
    color: "#CBD5E1",
    fontWeight: 700,
  },

  barChartPanel: {
    position: "relative",
    marginTop: 6,
    minHeight: 160,
  },

  barGridBg: {
    position: "absolute",
    inset: "10px 6px 52px 6px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    pointerEvents: "none",
    zIndex: 0,
  },

  barGridLine: {
    height: 1,
    background: "linear-gradient(90deg, transparent, #E2E8F0 12%, #E2E8F0 88%, transparent)",
    opacity: 0.85,
  },

  barChartWrap: {
    position: "relative",
    zIndex: 1,
    height: 160,
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 6px 0",
  },

  barItem: {
    flex: 1,
    display: "grid",
    justifyItems: "center",
    alignItems: "end",
    gap: 5,
  },

  bar: {
    width: "100%",
    maxWidth: 32,
    borderRadius: "12px 12px 6px 6px",
    background: "linear-gradient(180deg, #18D1BB 0%, #089F8A 100%)",
    boxShadow: "0 8px 16px rgba(8,159,138,0.16)",
  },

  barValue: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0F172A",
  },

  barLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },

  lineChartWrap: {
    height: 128,
    borderRadius: 16,
    background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
    border: "1px solid #E7E9F2",
    padding: 12,
    display: "grid",
    alignItems: "center",
    marginTop: 6,
  },

  teamGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 14,
    alignItems: "stretch",
  },

  teamCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    minHeight: 320,
    display: "grid",
    alignContent: "start",
    borderTop: `3px solid ${ACCENT_SOFT}`,
  },

  teamList: {
    display: "grid",
    gap: 12,
    marginTop: 10,
  },

  teamRow: {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
  },

  teamRowTop: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 12,
  },

  teamName: {
    fontSize: 13,
    fontWeight: 950,
    color: "#0F172A",
    lineHeight: 1.2,
  },

  teamMeta: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 1.35,
  },

  teamValueBox: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
    flexShrink: 0,
  },

  teamValue: {
    fontSize: 18,
    fontWeight: 980,
    color: ACCENT,
    lineHeight: 1,
  },

  teamValueLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  teamTimeValue: {
    fontSize: 14,
    fontWeight: 950,
    color: "#0F172A",
    flexShrink: 0,
  },

  teamTrack: {
    height: 10,
    borderRadius: 999,
    background: "#EEF2F7",
    overflow: "hidden",
    border: "1px solid #E7E9F2",
  },

  teamFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #18D1BB 0%, #089F8A 100%)",
  },

  teamFillSoft: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, rgba(24,209,187,0.65) 0%, rgba(8,159,138,0.95) 100%)",
  },

  teamFoot: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.35,
  },

  lineSvg: {
    width: "100%",
    height: "108px",
    overflow: "visible",
  },

  lineRefHint: {
    fontSize: 11,
    fontWeight: 750,
    color: "#94A3B8",
  },

  lineLegend: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },

  lineLegendCompact: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 750,
    color: "#64748B",
    lineHeight: 1.4,
  },

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: ACCENT,
    flexShrink: 0,
  },

  legendText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
  },

  donutWrap: {
    minHeight: 182,
    display: "grid",
    placeItems: "center",
    marginTop: 2,
  },

  donut: {
    width: 148,
    height: 148,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 12px 24px rgba(15,23,42,0.08)",
  },

  donutInner: {
    width: 94,
    height: 94,
    borderRadius: "50%",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    boxShadow: "inset 0 0 0 1px #E7E9F2",
  },

  donutValue: {
    fontWeight: 980,
    fontSize: 24,
    color: "#0F172A",
    lineHeight: 1,
  },

  donutText: {
    fontWeight: 800,
    fontSize: 11,
    color: "#64748B",
  },

  userList: {
    display: "grid",
    gap: 12,
    marginTop: 8,
  },

  userRow: {
    display: "grid",
    gap: 6,
  },

  userRowTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  userRowName: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0F172A",
  },

  userRowValue: {
    fontSize: 12,
    fontWeight: 900,
    color: ACCENT,
  },

  userTrack: {
    height: 10,
    borderRadius: 999,
    background: "#EEF2F7",
    overflow: "hidden",
    border: "1px solid #E7E9F2",
  },

  userFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #18D1BB 0%, #089F8A 100%)",
  },

  bottomCard: {
    borderRadius: 24,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    padding: 18,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },

  bottomTitle: {
    fontWeight: 980,
    fontSize: 18,
    color: "#0F172A",
    lineHeight: 1.15,
  },

  bottomText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 14,
  },

  noteList: {
    display: "grid",
    gap: 10,
    marginTop: 4,
  },

  noteItem: {
    display: "flex",
    alignItems: "start",
    gap: 10,
    color: "#475569",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.45,
    padding: "10px 0",
    borderTop: "1px dashed #E7E9F2",
  },

  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    flexShrink: 0,
    marginTop: 6,
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 12px 6px 6px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
    maxWidth: 220,
    minWidth: 0,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userName: {
    fontWeight: 800,
    fontSize: 12,
    color: "#0F172A",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userMail: {
    fontWeight: 650,
    fontSize: 11,
    color: SLATE,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  infoBanner: {
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    color: SLATE,
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 650,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
  },

  errorBanner: {
    border: "1px solid #F5C2C7",
    background: "#FFF5F5",
    color: "#B42318",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 800,
    fontSize: 13,
  },

  noDataBanner: {
    border: "1px solid #B6E3D8",
    background: "#F1FBF8",
    color: "#0F766E",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 800,
    fontSize: 13,
  },

  emptyMiniText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    display: "grid",
    placeItems: "center",
    width: "100%",
    minHeight: 120,
    textAlign: "center",
  },

  heroMain: {
    display: "grid",
    gap: 12,
    alignContent: "center",
  },

  heroChips: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },

  heroChip: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 900,
    fontSize: 12,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },

  heroNoteTop: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 12,
  },

  heroNoteEyebrow: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },

  heroNoteBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#F1FBF8",
    border: "1px solid rgba(8,159,138,0.22)",
    color: ACCENT,
    fontWeight: 950,
    fontSize: 11,
    whiteSpace: "nowrap",
  },

  sectionOverline: {
    color: ACCENT,
    fontWeight: 950,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  sectionOverlineLg: {
    color: ACCENT,
    fontWeight: 950,
    fontSize: 13,
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },

  filtersPanel: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 24,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
  },

  filtersPanelTop: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },

  filtersPanelInfo: {
    display: "grid",
    gap: 4,
  },

  filtersPanelTitle: {
    fontWeight: 980,
    fontSize: 15,
    color: "#0F172A",
  },

  filtersPanelText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.45,
  },

  filtersPanelMeta: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  filtersActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    flexWrap: "wrap",
  },

  dateInput: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #D7DCE5",
    background: "#fff",
    padding: "0 12px",
    fontSize: 14,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
  },

  filterBtnLabel: {
    fontWeight: 950,
    fontSize: 12,
    lineHeight: 1.1,
  },

  filterBtnHint: {
    fontWeight: 800,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 1.1,
  },

  filterBtnHintActive: {
    color: ACCENT,
  },

  alertsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },

  alertCard: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "grid",
    alignContent: "center",
    gap: 14,
    borderTop: `3px solid ${ACCENT_SOFT}`,
  },

  statusCard: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    border: "1px solid #E7E9F2",
    borderRadius: 24,
    padding: 16,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
    display: "grid",
    alignContent: "start",
    gap: 14,
  },

  alertCardHeader: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 12,
  },

  alertCardTitle: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },

  alertCardSubtitle: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 1.4,
  },

  alertCardBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 900,
    fontSize: 11,
    whiteSpace: "nowrap",
  },

  alertList: {
    display: "grid",
    gap: 10,
  },

  alertItem: {
    display: "grid",
    gridTemplateColumns: "36px 1fr",
    gap: 12,
    alignItems: "start",
    padding: 12,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
  },

  alertItemGood: {
    background: "#F7FEF9",
    border: "1px solid rgba(22,163,74,0.16)",
  },

  alertItemWarn: {
    background: "#FFFAF5",
    border: "1px solid rgba(217,119,6,0.16)",
  },

  alertItemDanger: {
    background: "#FFF7F7",
    border: "1px solid rgba(220,38,38,0.16)",
  },

  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "#E2E8F0",
    color: "#475569",
  },

  alertIconGood: {
    background: "rgba(22,163,74,0.12)",
    color: "#15803D",
  },

  alertIconWarn: {
    background: "rgba(217,119,6,0.12)",
    color: "#B45309",
  },

  alertIconDanger: {
    background: "rgba(220,38,38,0.12)",
    color: "#B91C1C",
  },

  alertBody: {
    display: "grid",
    gap: 4,
  },

  alertTitle: {
    color: "#0F172A",
    fontWeight: 950,
    fontSize: 13,
    lineHeight: 1.2,
  },

  alertDescription: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.45,
  },

  statusHero: {
    display: "grid",
    gap: 6,
    padding: 14,
    borderRadius: 20,
    background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
    border: "1px solid #E7E9F2",
  },

  statusHeroLabel: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 12,
  },

  statusHeroValue: {
    color: "#0F172A",
    fontWeight: 990,
    fontSize: 34,
    lineHeight: 1,
    letterSpacing: -0.8,
  },

  statusHeroText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.4,
  },

  statusMiniGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },

  statusMiniCard: {
    padding: 12,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    display: "grid",
    gap: 6,
    alignContent: "start",
  },

  statusMiniLabel: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 11,
    lineHeight: 1.3,
  },

  statusMiniValue: {
    color: "#0F172A",
    fontWeight: 980,
    fontSize: 20,
    lineHeight: 1.1,
  },

  statusTonePill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    padding: "7px 10px",
    borderRadius: 999,
    fontWeight: 950,
    fontSize: 11,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    color: "#475569",
  },

  statusTonePillGood: {
    background: "rgba(22,163,74,0.10)",
    border: "1px solid rgba(22,163,74,0.18)",
    color: "#15803D",
  },

  statusTonePillWarn: {
    background: "rgba(217,119,6,0.10)",
    border: "1px solid rgba(217,119,6,0.18)",
    color: "#B45309",
  },

  statusTonePillDanger: {
    background: "rgba(220,38,38,0.10)",
    border: "1px solid rgba(220,38,38,0.18)",
    color: "#B91C1C",
  },

  mixList: {
    display: "grid",
    gap: 12,
    marginTop: 8,
  },

  mixRow: {
    display: "grid",
    gap: 6,
  },

  mixRowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  mixLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0F172A",
  },

  mixValue: {
    fontSize: 12,
    fontWeight: 900,
    color: "#64748B",
  },

  mixTrack: {
    height: 10,
    borderRadius: 999,
    background: "#EEF2F7",
    border: "1px solid #E7E9F2",
    overflow: "hidden",
  },

  mixFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #18D1BB 0%, #089F8A 100%)",
  },

  bottomTop: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 6,
  },

  bottomEyebrow: {
    color: ACCENT,
    fontWeight: 950,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },

  bottomBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  kpiEyeBtn: {
    border: "1px solid rgba(8,159,138,0.28)",
    background: ACCENT_SOFT,
    borderRadius: 12,
    padding: "6px 8px",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    lineHeight: 0,
    fontFamily: "inherit",
  },
  mixValueWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  aperturasModalRoot: {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    boxSizing: "border-box",
  },
  aperturasModalBackdrop: {
    position: "absolute",
    inset: 0,
    background: "rgba(15,23,42,0.35)",
    border: "none",
    cursor: "pointer",
  },
  aperturasSheet: {
    position: "relative",
    zIndex: 1,
    width: "min(640px, calc(100vw - 32px))",
    maxHeight: "min(calc(100vh - 32px), 720px)",
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 64px rgba(15,23,42,0.2)",
    padding: 16,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflow: "hidden",
  },

  infoHelpSheet: {
    position: "relative",
    zIndex: 1,
    width: "min(720px, calc(100vw - 32px))",
    maxHeight: "min(calc(100vh - 32px), 720px)",
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 64px rgba(15,23,42,0.2)",
    padding: 16,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflow: "hidden",
  },

  infoModalSection: {
    paddingTop: 12,
    marginTop: 4,
    borderTop: "1px solid #E7E9F2",
  },

  aperturasSheetHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  aperturasSheetTitle: {
    fontSize: 17,
    fontWeight: 980,
    color: "#0F172A",
    lineHeight: 1.2,
  },
  aperturasSheetSubtitle: {
    marginTop: 4,
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.4,
  },
  aperturasSheetCloseBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  settingsSection: {
    display: "grid",
    gap: 10,
    paddingTop: 4,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: 950,
    color: "#0F172A",
  },
  settingsText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    lineHeight: 1.45,
  },
  settingsWarningText: {
    fontSize: 12,
    fontWeight: 800,
    color: "#92400E",
    background: "#FFFBEB",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: 10,
    padding: "8px 10px",
    lineHeight: 1.4,
  },
  settingsRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "center",
  },
  settingsRowCompact: {
    display: "grid",
    gap: 8,
  },
  settingsShowUsersBtn: {
    borderRadius: 10,
    border: "1px solid #D8E4FE",
    background: "#EEF4FF",
    color: "#1D4ED8",
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "fit-content",
  },
  settingsError: {
    fontSize: 12,
    fontWeight: 800,
    color: "#B42318",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 10,
    padding: "8px 10px",
  },
  settingsInput: {
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  settingsAddBtn: {
    borderRadius: 12,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  settingsEmpty: {
    padding: "12px 10px",
    borderRadius: 12,
    border: "1px dashed #D3DAE8",
    background: "#F8FAFC",
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
  },
  settingsList: {
    display: "grid",
    gap: 8,
    maxHeight: 220,
    overflow: "auto",
    paddingRight: 2,
  },
  settingsCatalogBox: {
    display: "grid",
    gap: 8,
    border: "1px solid #E7E9F2",
    borderRadius: 12,
    background: "#FBFCFF",
    padding: 10,
  },
  settingsCatalogTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#475467",
  },
  settingsCatalogList: {
    display: "grid",
    gap: 6,
    maxHeight: 180,
    overflow: "auto",
    paddingRight: 2,
  },
  settingsCatalogItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    border: "1px solid #E7E9F2",
    borderRadius: 10,
    background: "#fff",
    padding: "7px 8px",
  },
  settingsCatalogSub: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    marginTop: 2,
  },
  settingsTagInclude: {
    borderRadius: 999,
    border: "1px solid rgba(8,159,138,0.32)",
    background: "#F1FBF8",
    color: ACCENT,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  settingsTagExcluded: {
    borderRadius: 999,
    border: "1px solid #FECACA",
    background: "#FFF1F2",
    color: "#B42318",
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  settingsListItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    border: "1px solid #E7E9F2",
    borderRadius: 12,
    background: "#fff",
    padding: "8px 10px",
  },
  settingsListText: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  settingsRemoveBtn: {
    borderRadius: 10,
    border: "1px solid #FECACA",
    background: "#FFF1F2",
    color: "#B42318",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  aperturasModalLoadingBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "24px 8px",
    justifyContent: "center",
  },
  aperturasModalEmpty: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    padding: "20px 8px",
    textAlign: "center",
  },
  aperturasFiltersWrap: {
    display: "grid",
    gap: 10,
    flexShrink: 0,
  },
  aperturasFiltersRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  aperturasFilterField: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },
  aperturasFilterLabel: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 11,
  },
  aperturasFilterInput: {
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  aperturasFilterSelect: {
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  aperturasFilterClear: {
    justifySelf: "start",
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    color: "#475569",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  aperturasFilterHint: {
    color: "#94A3B8",
    fontWeight: 800,
    fontSize: 11,
  },
  aperturasListWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  aperturasList: {
    overflow: "auto",
    flex: 1,
    minHeight: 0,
    display: "grid",
    gap: 8,
    paddingRight: 4,
    WebkitOverflowScrolling: "touch",
  },
  aperturasRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 12px",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
  },
  aperturasRowTitle: {
    fontWeight: 950,
    fontSize: 13,
    color: "#0F172A",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  aperturasRowMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 800,
    color: "#64748B",
    lineHeight: 1.35,
  },
  estadoPill: {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  estadoPillCreada: {
    background: "#F1F5F9",
    color: "#475569",
    border: "1px solid #E2E8F0",
  },
  estadoPillProceso: {
    background: "#FFFBEB",
    color: "#B45309",
    border: "1px solid #FDE68A",
  },
  estadoPillCompleta: {
    background: "#F0FDF4",
    color: "#15803D",
    border: "1px solid #BBF7D0",
  },
  aperturasRowLink: {
    border: "none",
    background: "transparent",
    color: ACCENT,
    fontWeight: 950,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
    padding: "2px 0",
  },

  // mobile overrides
  mShell: { minHeight: "100dvh" },
  mTopbar: { position: "sticky", top: 0, zIndex: 120 },
  mTopbarInner: { padding: "10px 12px", minHeight: 56, gap: 8 },
  mTopbarRight: { width: "100%", justifyContent: "flex-start", gap: 8 },
  mUserBox: { display: "none" },
  mBtnGhost: { width: "100%", justifyContent: "center", minHeight: 40 },
  mMain: { padding: "12px 10px 18px" },
  mContainer: { gap: 12 },
  mHeroCompact: { gap: 10, alignItems: "flex-start" },
  mHeroInfoBtn: { width: "100%", justifyContent: "center" },
  mAlertsToggleBtn: { width: "100%", justifyContent: "center" },
  mStickyFiltersOnly: { position: "relative", top: "auto", paddingBottom: 8 },
  mStickyKpisOnly: { position: "relative", top: "auto", paddingBottom: 8 },
  mKpiGrid: { gridTemplateColumns: "1fr", gap: 10 },
  mChartGrid: { gridTemplateColumns: "1fr", gap: 10 },
  mTeamGrid: { gridTemplateColumns: "1fr", gap: 10 },
};