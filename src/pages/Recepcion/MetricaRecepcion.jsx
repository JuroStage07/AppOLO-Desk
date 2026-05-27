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
import {
  Brand,
  GhostButton,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";
const ANDEN_SETTINGS_KEY = "recepcion.metrica.andenes.settings.v1";
const EXCLUDED_ANDEN_USERS_LEGACY_KEY =
  "recepcion.metrica.andenes.excludedUsers.v1";
const EXCLUDED_ACTIONS_KEY = "recepcion.metrica.excludedActions.v1";

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

function actionDurationMs(row) {
  const stored = Number(row?.totalTimeMs ?? row?.tiempoTotalMs ?? row?.durationMs ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const started = toDateSafe(row?.startedAt);
  const completed = toDateSafe(row?.completedAt ?? row?.completeAt);
  if (!started || !completed) return 0;

  const diff = completed.getTime() - started.getTime();
  return diff > 0 ? diff : 0;
}

function normalizeExcludedUserToken(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function starterMatchesExcludedUsers(starter, excludedUsersSet) {
  if (!excludedUsersSet || excludedUsersSet.size === 0) return false;
  const uidKey = normalizeExcludedUserToken(
    starter?.starterUid ?? starter?.uid ?? starter?.userId
  );
  const nameKey = normalizeExcludedUserToken(
    starter?.starter ??
      starter?.label ??
      starter?.displayName ??
      starter?.nombre ??
      starter?.userName
  );
  return excludedUsersSet.has(uidKey) || excludedUsersSet.has(nameKey);
}

function filterDashboardDocsByExcludedUsers(docs = [], excludedUsersSet) {
  if (!excludedUsersSet || excludedUsersSet.size === 0) return docs;

  return docs.map((d) => {
    const starters = Array.isArray(d?.starters)
      ? d.starters.filter((s) => !starterMatchesExcludedUsers(s, excludedUsersSet))
      : [];
    const hasStarterMetrics = starters.length > 0 || Array.isArray(d?.starters);

    const andenes = Array.isArray(d?.andenes)
      ? d.andenes.map((a) => {
          const rawStarters = Array.isArray(a?.starters)
            ? a.starters
            : Array.isArray(a?.usuarios)
              ? a.usuarios
              : Array.isArray(a?.operators)
                ? a.operators
                : null;

          if (!rawStarters) return a;

          const filteredStarters = rawStarters.filter(
            (s) => !starterMatchesExcludedUsers(s, excludedUsersSet)
          );

          return {
            ...a,
            starters: filteredStarters,
            accionesDia: sum(filteredStarters, (s) =>
              Number(s?.iniciadasDia ?? s?.accionesDia ?? s?.iniciadas ?? s?.acciones ?? 0)
            ),
            finalizadasDia: sum(filteredStarters, (s) =>
              Number(s?.finalizadasDia ?? s?.finalizadas ?? s?.cerradas ?? 0)
            ),
          };
        })
      : d?.andenes;

    if (!hasStarterMetrics) {
      return { ...d, andenes };
    }

    return {
      ...d,
      starters,
      andenes,
      accionesIniciadas: sum(starters, (s) => Number(s?.iniciadasDia || 0)),
      accionesFinalizadas: sum(starters, (s) => Number(s?.finalizadasDia || 0)),
      accionesBultosTotales: sum(starters, (s) => Number(s?.bultosTotalesDia || 0)),
      accionesTiempoTotalMs: sum(starters, (s) => Number(s?.tiempoTotalMsDia || 0)),
    };
  });
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

function defaultRangeDates() {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 6);
  return {
    desde: ymd(desde),
    hasta: ymd(hasta),
  };
}

function formatRangeLabel(range = {}) {
  const desde = parseYMD(range.desde);
  const hasta = parseYMD(range.hasta);
  if (!desde || !hasta) return "Rango personalizado";
  return `${desde.toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
  })} - ${hasta.toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
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

function buildDayKeysForFilter(filterKey, selectedDate = "", range = null) {
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

  if (filterKey === "rango") {
    const startRaw = parseYMD(range?.desde);
    const endRaw = parseYMD(range?.hasta);
    if (!startRaw || !endRaw) return [];
    const start = startRaw <= endRaw ? startRaw : endRaw;
    const end = startRaw <= endRaw ? endRaw : startRaw;
    const out = [];
    const cur = new Date(start);
    while (cur <= end && out.length < 370) {
      out.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

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

function medianOfNumbers(values = []) {
  const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid]);
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Cumplimiento % de un corte diario (null si no hubo iniciadas). */
function dailyCompliancePercent(doc) {
  const iniciadas = Number(doc?.accionesIniciadas || 0);
  const finalizadas = Number(doc?.accionesFinalizadas || 0);
  if (iniciadas <= 0) return null;
  return Math.round((finalizadas / iniciadas) * 100);
}

/** Mediana del cumplimiento diario en el período (días con iniciadas > 0). */
function medianDailyCompliance(docs = []) {
  const rates = docs.map(dailyCompliancePercent).filter((v) => v != null);
  return medianOfNumbers(rates);
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
      description: `La mediana diaria de cierre operativo es ${compliance}% en el período actual.`,
    });
  } else if (compliance < 85) {
    alerts.push({
      tone: "warn",
      title: "Cumplimiento en observación",
      description: `La mediana diaria de cumplimiento es ${compliance}% y todavía puede mejorar.`,
    });
  } else {
    alerts.push({
      tone: "good",
      title: "Cumplimiento saludable",
      description: `La mediana diaria de cumplimiento es ${compliance}% en el período.`,
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
      starterUid: x.starterUid,
      finalizadas: x.finalizadas,
      tiempoPromedioMs: x.tiempoPromedioMs,
      tiempoTotalMs: x.tiempoTotalMs,
    }))
    .sort((a, b) => b.tiempoPromedioMs - a.tiempoPromedioMs);
}

function actionProveedorLabel(row) {
  const name = String(row?.proveedorNombre ?? "").trim();
  return name || "Sin proveedor";
}

/** Acciones cerradas en el período, listas para métricas por proveedor (sin agregar). */
function filterAccionesParaMetricaProveedor(rows = [], options = {}) {
  const allowedDayKeys = options.allowedDayKeys || [];
  const excludedActionsSet = options.excludedActionsSet;
  const excludedAndenUsersSet = options.excludedAndenUsersSet;
  const allowed = new Set(allowedDayKeys);
  const out = [];

  for (const row of rows) {
    const completedAt = row?.completedAt ?? row?.completeAt;
    const completedDate = toDateSafe(completedAt);
    if (!completedDate || !allowed.has(ymd(completedDate))) continue;

    if (excludedActionsSet?.has(String(row?.id || "").trim())) continue;

    const who = actionStarterIdentity(row);
    const uidKey = normalizeExcludedUserToken(who.uid);
    const nameKey = normalizeExcludedUserToken(who.label);
    if (
      excludedAndenUsersSet?.has(uidKey) ||
      excludedAndenUsersSet?.has(nameKey)
    ) {
      continue;
    }

    out.push(row);
  }

  return out;
}

function aggregateProviderTimesByProveedor(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const dur = actionDurationMs(row);
    const label = actionProveedorLabel(row);

    if (!map.has(label)) {
      map.set(label, {
        label,
        finalizadas: 0,
        tiempoTotalMs: 0,
        tiempoPromedioMs: 0,
      });
    }

    const agg = map.get(label);
    agg.finalizadas += 1;
    agg.tiempoTotalMs += Number(dur || 0);
  }

  return Array.from(map.values())
    .map((x) => ({
      ...x,
      tiempoPromedioMs:
        x.finalizadas > 0 ? Math.round(x.tiempoTotalMs / x.finalizadas) : 0,
    }))
    .sort((a, b) => b.tiempoPromedioMs - a.tiempoPromedioMs);
}

/** Clave estable para filtrar/agrupar starters en la misma acción. */
function starterFilterKeyForRow(row) {
  const who = actionStarterIdentity(row);
  const uid = String(who.uid || "").trim();
  if (uid && uid !== "sin_uid") return `uid:${uid}`;
  const nk = normalizeExcludedUserToken(who.label);
  return nk ? `name:${nk}` : "__unknown__";
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
      const med = chunk.length
        ? medianOfNumbers(chunk.map((x) => x.value))
        : 0;
      chunks.push({ label: `S${chunks.length + 1}`, value: med });
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
  const med = (chunk) =>
    chunk.length ? medianOfNumbers(chunk.map((x) => Number(x.value) || 0)) : 0;
  const a = med(first);
  const b = med(second);
  const diff = b - a;
  if (Math.abs(diff) < 4) {
    return "El cumplimiento se mantiene relativamente estable entre el inicio y el final del período mostrado.";
  }
  if (diff > 0) {
    return `Tendencia favorable: la mediana de cumplimiento en la segunda mitad del período es ~${diff} puntos porcentuales mayor que en la primera.`;
  }
  return `Atención: la mediana de cumplimiento en la segunda mitad del período es ~${Math.abs(diff)} puntos porcentuales menor que en la primera.`;
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
      hint: "Mediana del cumplimiento diario (finalizadas ÷ iniciadas por día)",
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
      "Aun con buena mediana de cumplimiento, hay operadores con iniciadas pendientes de cierre: conviene cerrar el detalle por usuario.";
  } else if (tiempoPromedioMs >= 6 * 60 * 60 * 1000) {
    recommendedFocus =
      "El tiempo promedio de descarga es elevado; revisar procesos o excepciones que alargan el ciclo.";
  } else {
    recommendedFocus =
      "Mantener el ritmo actual y usar el detalle por andén para detectar desvíos tempranos.";
  }

  const metricSnapshot = [
    { label: "Cumplimiento (mediana diaria)", value: `${compliance}%` },
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

function buildDashboardFromDailyDocs(
  filterKey,
  docs = [],
  selectedDate = "",
  customRange = null,
  excludedUsersSet = new Set()
) {
  const metricDocs = filterDashboardDocsByExcludedUsers(docs, excludedUsersSet);
  const labelMap = {
    hoy: "Hoy",
    semana: "Semana actual",
    mes: "Mes actual",
    rango: formatRangeLabel(customRange),
    fecha: formatSelectedDateLabel(selectedDate),
  };

  const heroBadgeMap = {
    hoy: "Tiempo real",
    semana: "Semanal",
    mes: "Mensual",
    rango: "Personalizado",
    fecha: "Fecha específica",
  };

  const accionesFinalizadas = sum(metricDocs, (d) => d.accionesFinalizadas);
  const accionesIniciadas = sum(metricDocs, (d) => d.accionesIniciadas);
  const accionesCreadas = sum(metricDocs, (d) => d.accionesCreadas);
  const tiempoTotalMs = sum(metricDocs, (d) => d.accionesTiempoTotalMs);

  const tiempoPromedioMs =
    accionesFinalizadas > 0 ? Math.round(tiempoTotalMs / accionesFinalizadas) : 0;

  const andenesEnUso = countAndenesInUse(metricDocs);

  const compliance = medianDailyCompliance(metricDocs);

  const { alerts, pendingUsers: pendingUsersCount } = buildAlertsFromDocs({
    compliance,
    tiempoPromedioMs,
    docs: metricDocs,
  });

  const bultosTotales = sum(metricDocs, (d) => d.accionesBultosTotales);
  const bultosPorDescarga =
    accionesFinalizadas > 0 ? Math.round(bultosTotales / accionesFinalizadas) : 0;

  const horasTotales = tiempoTotalMs > 0 ? tiempoTotalMs / 3600000 : 0;
  const bultosPorHora =
    horasTotales > 0 ? Math.round(bultosTotales / horasTotales) : 0;

  const typeMix = buildTypeMix(metricDocs);
  const andenesData = buildAndenesData(metricDocs);

  const teamProductivity = buildTeamProductivity(metricDocs).slice(0, 6);
  const teamTimes = buildTeamTimes(metricDocs).slice(0, 6);

  const barData = buildBarData(filterKey, metricDocs);
  const lineData = buildLineData(filterKey, metricDocs);

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
    docs: metricDocs,
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
        hint: "Mediana del cumplimiento diario (finalizadas ÷ iniciadas por día)",
        comparison: "Objetivo operativo 85% · mediana diaria",
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
    providerTimes: [],
    providerTimesAcciones: [],
    notes: [
      `Se registran ${fmtInt(accionesFinalizadas)} descargas completadas durante ${labelMap[filterKey] || "el período seleccionado"}.`,
      `La mediana diaria de cumplimiento operativo es ${compliance}% (${fmtInt(accionesIniciadas)} iniciadas y ${fmtInt(accionesCreadas)} creadas en total en el período).`,
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
  push(["Cumplimiento mediana diaria %", String(data?.compliance ?? "")]);
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
    "cumplimientoDiaPct",
    "accionesBultosTotales",
    "accionesTiempoTotalMs",
    "tiempoPromedioDescarga",
  ]);
  for (const row of data?.dailySlice || []) {
    const af = row.accionesFinalizadas;
    const tpMs =
      af > 0 ? Math.round(row.accionesTiempoTotalMs / af) : 0;
    const diaPct =
      row.cumplimientoDiaPct != null ? String(row.cumplimientoDiaPct) : "—";
    push([
      row.dayKey,
      row.docId,
      String(row.accionesFinalizadas),
      String(row.accionesIniciadas),
      String(row.accionesCreadas),
      diaPct,
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

  push(["Tiempos por proveedor (accion_descarga, por fecha de cierre)"]);
  push(["Proveedor", "Descargas cerradas", "Tiempo promedio", "Tiempo total"]);
  for (const t of data?.providerTimes || []) {
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
    { key: "rango", label: "Rango personalizado", hint: "Desde / hasta" },
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
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
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
              {data.map((item, idx) => {
                const isHovered = hoveredIndex === idx;
                return (
                  <div 
                    key={item.label} 
                    style={ui.barItem}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div
                      style={{
                        ...ui.bar,
                        height: `${Math.max((item.value / max) * 118, 10)}px`,
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                        cursor: 'pointer',
                        boxShadow: isHovered 
                          ? '0 12px 24px rgba(8,159,138,0.28)' 
                          : '0 8px 16px rgba(8,159,138,0.16)',
                      }}
                      title={`${item.label}: ${fmtInt(item.value)} descargas`}
                    />
                    <div style={{
                      ...ui.barValue,
                      transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                      transition: 'transform 200ms ease',
                      color: isHovered ? ACCENT : '#0F172A',
                      fontWeight: isHovered ? 950 : 900,
                    }}>
                      {fmtInt(item.value)}
                    </div>
                    <div style={{
                      ...ui.barLabel,
                      color: isHovered ? '#0F172A' : '#64748B',
                      fontWeight: isHovered ? 900 : 800,
                      transition: 'all 200ms ease',
                    }} title={String(item.label)}>
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniLineChart({ data = [], periodLabel = "Últimos cortes" }) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
  const lineGradId = useId().replace(/:/g, "");
  const w = 100;
  const h = 44;
  const padT = 6;
  const padB = 4;
  const chartH = h - padT - padB;

  const nums = data.map((d) => Math.max(0, Math.min(100, Number(d.value) || 0)));
  const med = medianOfNumbers(nums);
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
            Cumplimiento diario por intervalo (0–100%) · {periodLabel}
          </div>
          {data.length > 0 && (
            <div style={ui.chartMetaRow}>
              Mín. <b>{minV}%</b>
              <span style={ui.chartMetaSep}>·</span>
              Mediana <b>{med}%</b>
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
              style={{
                transition: 'opacity 300ms ease',
              }}
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
              style={{
                transition: 'stroke-width 200ms ease',
              }}
            />
            {data.map((d, i) => {
              const x = (i / Math.max(data.length - 1, 1)) * w;
              const v = Math.max(0, Math.min(100, Number(d.value) || 0));
              const y = padT + (1 - v / 100) * chartH;
              const isHovered = hoveredIndex === i;
              return (
                <g key={`${d.label}-${i}`}>
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={isHovered ? "1.8" : "1.1"} 
                    fill="#fff" 
                    stroke={ACCENT} 
                    strokeWidth={isHovered ? "0.6" : "0.45"}
                    style={{
                      transition: 'all 200ms ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <title>{d.label}: {d.value}%</title>
                  </circle>
                  {isHovered && (
                    <text
                      x={x}
                      y={y - 3}
                      textAnchor="middle"
                      fill={ACCENT}
                      fontSize="3"
                      fontWeight="900"
                    >
                      {d.value}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {!compactLegend && data.length > 0 ? (
        <div style={ui.lineLegend}>
          {data.map((d, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div 
                key={d.label} 
                style={{
                  ...ui.legendItem,
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  transition: 'transform 200ms ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span style={{
                  ...ui.legendDot,
                  transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                  transition: 'transform 200ms ease',
                }} />
                <span style={{
                  ...ui.legendText,
                  color: isHovered ? ACCENT : '#64748B',
                  fontWeight: isHovered ? 900 : 800,
                  transition: 'all 200ms ease',
                }}>
                  {d.label}: {d.value}%
                </span>
              </div>
            );
          })}
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
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
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
          data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div 
                key={item.label} 
                style={{
                  ...ui.userRow,
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  background: isHovered ? '#F8FAFC' : 'transparent',
                  borderRadius: '12px',
                  padding: isHovered ? '10px' : '8px',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={ui.userRowTop}>
                  <div style={{
                    ...ui.userRowName,
                    color: isHovered ? ACCENT : '#0F172A',
                    transition: 'color 200ms ease',
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    ...ui.userRowValue,
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 200ms ease',
                    color: isHovered ? ACCENT : '#0F172A',
                  }}>
                    {item.value}
                  </div>
                </div>

                <div style={ui.userTrack}>
                  <div
                    style={{
                      ...ui.userFill,
                      width: `${Math.max((item.value / max) * 100, 8)}%`,
                      transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered 
                        ? '0 4px 12px rgba(8,159,138,0.3)' 
                        : '0 2px 6px rgba(8,159,138,0.15)',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MixTypeChart({ data = [], periodLabel = "" }) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
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
          data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div 
                key={item.label} 
                style={{
                  ...ui.mixRow,
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  background: isHovered ? '#F8FAFC' : 'transparent',
                  borderRadius: '12px',
                  padding: isHovered ? '10px' : '8px',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={ui.mixRowTop}>
                  <div style={{
                    ...ui.mixLabel,
                    color: isHovered ? ACCENT : '#0F172A',
                    transition: 'color 200ms ease',
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    ...ui.mixValue,
                    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 200ms ease',
                    color: isHovered ? ACCENT : '#0F172A',
                  }}>
                    {fmtInt(item.value)} · {item.percent}%
                  </div>
                </div>

                <div style={ui.mixTrack}>
                  <div
                    style={{
                      ...ui.mixFill,
                      width: `${Math.max((item.value / max) * 100, 6)}%`,
                      transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered 
                        ? '0 4px 12px rgba(8,159,138,0.3)' 
                        : '0 2px 6px rgba(8,159,138,0.15)',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AndenesChart({ data = [], periodLabel = "", onOpenDetalleAnden }) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
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
          data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div 
                key={item.label} 
                style={{
                  ...ui.mixRow,
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  background: isHovered ? '#F8FAFC' : 'transparent',
                  borderRadius: '12px',
                  padding: isHovered ? '10px' : '8px',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={ui.mixRowTop}>
                  <div style={{
                    ...ui.mixLabel,
                    color: isHovered ? ACCENT : '#0F172A',
                    transition: 'color 200ms ease',
                  }}>
                    {item.label}
                  </div>
                  <div style={ui.mixValueWrap}>
                    <div style={{
                      ...ui.mixValue,
                      color: isHovered ? ACCENT : '#0F172A',
                      transition: 'color 200ms ease',
                    }}>
                      {item.acciones} acc · {item.finalizadas} fin
                    </div>
                    <button
                      type="button"
                      style={{
                        ...ui.kpiEyeBtn,
                        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 200ms ease',
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
                      transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered 
                        ? '0 4px 12px rgba(8,159,138,0.3)' 
                        : '0 2px 6px rgba(8,159,138,0.15)',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TeamProductivityCard({
  data = [],
  periodLabel = "",
  excludedUsersCount = 0,
  onOpenSettings,
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
  const max = Math.max(...data.map((d) => d.finalizadas), 1);

  return (
    <div style={ui.teamCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Productividad por usuario</div>
          <div style={ui.chartSubtitle}>
            Cierres, volumen y ritmo de ejecución · {periodLabel}
          </div>
          {excludedUsersCount > 0 ? (
            <div style={ui.chartMetaRow}>
              {excludedUsersCount} usuario{excludedUsersCount === 1 ? "" : "s"} excluido
              {excludedUsersCount === 1 ? "" : "s"} de las métricas
            </div>
          ) : null}
        </div>
        <div style={ui.cardHeaderActions}>
          <button
            type="button"
            style={ui.kpiEyeBtn}
            title="Excluir usuarios de las métricas"
            aria-label="Configurar usuarios excluidos de productividad"
            onClick={onOpenSettings}
          >
            <Settings size={16} strokeWidth={2.25} color={ACCENT} />
          </button>
          <span style={ui.chartBadge}>Equipo</span>
        </div>
      </div>

      <div style={ui.teamList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos de usuarios para el período.</div>
        ) : (
          data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <div 
                key={item.label} 
                style={{
                  ...ui.teamRow,
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  background: isHovered ? '#F8FAFC' : 'transparent',
                  borderRadius: '12px',
                  padding: isHovered ? '12px' : '10px',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={ui.teamRowTop}>
                  <div>
                    <div style={{
                      ...ui.teamName,
                      color: isHovered ? ACCENT : '#0F172A',
                      transition: 'color 200ms ease',
                    }}>
                      {item.label}
                    </div>
                    <div style={ui.teamMeta}>
                      {fmtInt(item.finalizadas)} cerradas · {fmtInt(item.iniciadas)} iniciadas
                    </div>
                  </div>

                  <div style={ui.teamValueBox}>
                    <div style={{
                      ...ui.teamValue,
                      transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                      transition: 'transform 200ms ease',
                      color: isHovered ? ACCENT : '#0F172A',
                    }}>
                      {fmtInt(item.bultos)}
                    </div>
                    <div style={ui.teamValueLabel}>bultos</div>
                  </div>
                </div>

                <div style={ui.teamTrack}>
                  <div
                    style={{
                      ...ui.teamFill,
                      width: `${Math.max((item.finalizadas / max) * 100, 6)}%`,
                      transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered 
                        ? '0 4px 12px rgba(8,159,138,0.3)' 
                        : '0 2px 6px rgba(8,159,138,0.15)',
                    }}
                  />
                </div>

                <div style={ui.teamFoot}>
                  <span>Tiempo promedio: {fmtMinutesFromMs(item.tiempoPromedioMs)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TeamTimesCard({
  data = [],
  periodLabel = "",
  onOpenUserDetail,
  chartTitle = "Tiempos por usuario",
  chartSubtitle,
  badgeLabel = "Tiempo",
  detailable = true,
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
  const subtitle =
    chartSubtitle ??
    `Comparativo de duración promedio por operador · ${periodLabel}`;
  const valid = data.filter((d) => Number(d.tiempoPromedioMs || 0) > 0);
  const max = Math.max(...valid.map((d) => d.tiempoPromedioMs), 1);

  return (
    <div style={ui.teamCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>{chartTitle}</div>
          <div style={ui.chartSubtitle}>{subtitle}</div>
        </div>
        <span style={ui.chartBadge}>{badgeLabel}</span>
      </div>

      <div style={ui.teamList}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin tiempos registrados para el período.</div>
        ) : (
          data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            const width =
              item.tiempoPromedioMs > 0
                ? `${Math.max((item.tiempoPromedioMs / max) * 100, 6)}%`
                : "6%";

            return (
              <div 
                key={item.label + String(idx)}
                style={{
                  ...ui.teamRow,
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  background: isHovered ? '#F8FAFC' : 'transparent',
                  borderRadius: '12px',
                  padding: isHovered ? '12px' : '10px',
                }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={ui.teamRowTop}>
                  <div>
                    <div style={{
                      ...ui.teamName,
                      color: isHovered ? ACCENT : '#0F172A',
                      transition: 'color 200ms ease',
                    }}>
                      {item.label}
                    </div>
                    <div style={ui.teamMeta}>
                      {fmtInt(item.finalizadas)} cerradas
                    </div>
                  </div>

                  <div style={ui.mixValueWrap}>
                    <div style={{
                      ...ui.teamTimeValue,
                      transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 200ms ease',
                      color: isHovered ? ACCENT : '#0F172A',
                    }}>
                      {item.tiempoPromedioMs > 0
                        ? fmtMinutesFromMs(item.tiempoPromedioMs)
                        : "—"}
                    </div>
                    {detailable ? (
                      <button
                        type="button"
                        style={{
                          ...ui.kpiEyeBtn,
                          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                          transition: 'transform 200ms ease',
                        }}
                        title="Ver descargas contadas"
                        aria-label={`Ver descargas contadas para ${item.label}`}
                        onClick={() => onOpenUserDetail?.(item)}
                      >
                        <Eye size={16} strokeWidth={2.2} color={ACCENT} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={ui.teamTrack}>
                  <div
                    style={{
                      ...ui.teamFillSoft,
                      width,
                      transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered 
                        ? '0 4px 12px rgba(8,159,138,0.3)' 
                        : '0 2px 6px rgba(8,159,138,0.15)',
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

function ProviderTimesModal({ open, onClose, sourceAcciones = [], periodLabel = "" }) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);
  const [starterKey, setStarterKey] = React.useState("__all__");
  const [starterSearch, setStarterSearch] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setStarterKey("__all__");
      setStarterSearch("");
    }
  }, [open]);

  const starterOptions = useMemo(() => {
    const m = new Map();
    for (const row of sourceAcciones) {
      const k = starterFilterKeyForRow(row);
      if (k === "__unknown__") continue;
      const who = actionStarterIdentity(row);
      if (!m.has(k)) {
        const label =
          String(who.label || "").trim() ||
          String(who.uid || "").trim() ||
          k.replace(/^uid:/, "").replace(/^name:/, "");
        m.set(k, label);
      }
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "es", { sensitivity: "base" })
      );
  }, [sourceAcciones]);

  const starterOptionsFiltered = useMemo(() => {
    const q = normalizeExcludedUserToken(starterSearch);
    if (!q) return starterOptions;
    return starterOptions.filter(
      (o) =>
        normalizeExcludedUserToken(o.label).includes(q) ||
        normalizeExcludedUserToken(o.value).includes(q)
    );
  }, [starterOptions, starterSearch]);

  React.useEffect(() => {
    if (starterKey === "__all__") return;
    if (!starterOptionsFiltered.some((o) => o.value === starterKey)) {
      setStarterKey("__all__");
    }
  }, [starterSearch, starterOptionsFiltered, starterKey]);

  const filteredRows = useMemo(() => {
    if (starterKey === "__all__") return sourceAcciones;
    return sourceAcciones.filter((row) => starterFilterKeyForRow(row) === starterKey);
  }, [sourceAcciones, starterKey]);

  const data = useMemo(
    () => aggregateProviderTimesByProveedor(filteredRows),
    [filteredRows]
  );

  const maxProm = useMemo(() => {
    const v = data.filter((d) => Number(d.tiempoPromedioMs || 0) > 0);
    return Math.max(...v.map((d) => d.tiempoPromedioMs), 1);
  }, [data]);

  const totalCerradas = useMemo(
    () => sum(data, (d) => Number(d.finalizadas || 0)),
    [data]
  );
  const totalMs = useMemo(
    () => sum(data, (d) => Number(d.tiempoTotalMs || 0)),
    [data]
  );

  if (!open) return null;

  const emptyMaster = sourceAcciones.length === 0;
  const emptyFiltered = !emptyMaster && filteredRows.length === 0;

  return (
    <div
      style={ui.aperturasModalRoot}
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-times-modal-title"
    >
      <button type="button" style={ui.aperturasModalBackdrop} onClick={onClose} aria-label="Cerrar" />

      <div style={ui.providerTimesSheet}>
        <div style={ui.aperturasSheetHeader}>
          <div style={{ minWidth: 0 }}>
            <div id="provider-times-modal-title" style={ui.aperturasSheetTitle}>
              Tiempos por proveedor
            </div>
            <div style={ui.aperturasSheetSubtitle}>
              Duración media por proveedor (<code style={ui.inlineCodeHint}>proveedorNombre</code>)
              filtrable por quien inició la descarga (
              <code style={ui.inlineCodeHint}>starter</code> /{" "}
              <code style={ui.inlineCodeHint}>starterUid</code>) · período <b>{periodLabel}</b>
            </div>
          </div>
          <button type="button" onClick={onClose} style={ui.aperturasSheetCloseBtn}>
            Cerrar
          </button>
        </div>

        {emptyMaster ? (
          <div style={ui.aperturasModalEmpty}>
            No hay descargas cerradas con proveedor registrado para este período (o los datos aún se
            están cargando).
          </div>
        ) : (
          <>
            <div style={ui.providerTimesFilterBar}>
              <div style={ui.providerTimesFilterField}>
                <span style={ui.providerTimesFilterLabel}>Buscar starter</span>
                <input
                  type="search"
                  value={starterSearch}
                  onChange={(e) => setStarterSearch(e.target.value)}
                  placeholder="Nombre o parte del identificador…"
                  style={ui.providerTimesSearchInput}
                  autoComplete="off"
                />
              </div>
              <div style={ui.providerTimesFilterField}>
                <label htmlFor="metrica-provider-starter-select" style={ui.providerTimesFilterLabel}>
                  Starter
                </label>
                <select
                  id="metrica-provider-starter-select"
                  value={starterKey}
                  onChange={(e) => setStarterKey(e.target.value)}
                  style={ui.providerTimesSelect}
                >
                  <option value="__all__">Todos los starters ({fmtInt(sourceAcciones.length)} descargas)</option>
                  {starterOptionsFiltered.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {starterSearch.trim() && starterOptionsFiltered.length === 0 ? (
                  <div style={ui.providerTimesFilterHint}>
                    Ningún starter coincide con la búsqueda.
                  </div>
                ) : null}
              </div>
            </div>

            {emptyFiltered ? (
              <div style={ui.aperturasModalEmpty}>
                No hay descargas cerradas para el starter seleccionado en este período.
              </div>
            ) : data.length === 0 ? (
              <div style={ui.aperturasModalEmpty}>
                Sin filas para mostrar.
              </div>
            ) : (
              <>
                <div style={ui.userTimeSummary}>
                  <div style={ui.statusMiniCard}>
                    <div style={ui.statusMiniLabel}>Proveedores</div>
                    <div style={ui.statusMiniValue}>{fmtInt(data.length)}</div>
                  </div>
                  <div style={ui.statusMiniCard}>
                    <div style={ui.statusMiniLabel}>Descargas cerradas</div>
                    <div style={ui.statusMiniValue}>{fmtInt(totalCerradas)}</div>
                  </div>
                  <div style={ui.statusMiniCard}>
                    <div style={ui.statusMiniLabel}>Tiempo total</div>
                    <div style={ui.statusMiniValue}>{fmtMinutesFromMs(totalMs)}</div>
                  </div>
                </div>

                <div style={ui.providerTimesListOuter}>
                  <div style={ui.teamList}>
                    {data.map((item, idx) => {
                      const isHovered = hoveredIndex === idx;
                      const width =
                        item.tiempoPromedioMs > 0
                          ? `${Math.max((item.tiempoPromedioMs / maxProm) * 100, 6)}%`
                          : "6%";

                      return (
                        <div
                          key={`${item.label}-${idx}`}
                          style={{
                            ...ui.teamRow,
                            transform: isHovered ? "translateX(4px)" : "translateX(0)",
                            transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                            cursor: "default",
                            background: isHovered ? "#F8FAFC" : "transparent",
                            borderRadius: "12px",
                            padding: isHovered ? "12px" : "10px",
                          }}
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <div style={ui.teamRowTop}>
                            <div>
                              <div
                                style={{
                                  ...ui.teamName,
                                  color: isHovered ? ACCENT : "#0F172A",
                                  transition: "color 200ms ease",
                                }}
                              >
                                {item.label}
                              </div>
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
                                transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
                              }}
                            />
                          </div>

                          <div style={ui.teamFoot}>
                            <span>Total acumulado: {fmtMinutesFromMs(item.tiempoTotalMs)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * VolumenPorFechaChart — Line chart showing number of completed actions per day.
 * Styled like the OTs dashboard "Volumen por fecha" card.
 */
function VolumenPorFechaChart({ actions = [], accentColor = "#0F172A", accentSoft = "rgba(15,23,42,0.06)", periodLabel = "" }) {
  const volGradId = useId().replace(/:/g, "");

  // Group actions by completion date
  const dailyMap = useMemo(() => {
    const map = new Map();
    for (const row of actions) {
      const completedAt = row?.completedAt ?? row?.completeAt;
      const d = toDateSafe(completedAt);
      if (!d) continue;
      const key = ymd(d);
      map.set(key, (map.get(key) || 0) + 1);
    }
    // Sort by date
    const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([dayKey, count]) => {
      const dt = new Date(`${dayKey}T00:00:00`);
      const label = dt.toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
      return { dayKey, label, value: count };
    });
  }, [actions]);

  const total = dailyMap.reduce((s, d) => s + d.value, 0);
  const maxVal = dailyMap.length > 0 ? Math.max(...dailyMap.map((d) => d.value)) : 0;
  const avg = dailyMap.length > 0 ? Math.round(total / dailyMap.length) : 0;
  const peak = maxVal;

  // SVG line chart dimensions
  const w = 100;
  const h = 50;
  const padT = 8;
  const padB = 6;
  const padL = 0;
  const padR = 0;
  const chartH = h - padT - padB;
  const chartW = w - padL - padR;

  const points = dailyMap.map((d, i) => {
    const x = padL + (i / Math.max(dailyMap.length - 1, 1)) * chartW;
    const y = padT + (1 - d.value / Math.max(maxVal, 1)) * chartH;
    return { x, y };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = points.length > 0
    ? `${padL},${padT + chartH} ${points.map((p) => `${p.x},${p.y}`).join(" ")} ${padL + chartW},${padT + chartH}`
    : "";

  // Y-axis reference lines
  const ySteps = maxVal > 0 ? [0, Math.round(maxVal * 0.33), Math.round(maxVal * 0.66), maxVal] : [];

  if (dailyMap.length === 0) {
    return (
      <div style={volStyles.card}>
        <div style={volStyles.titleRow}>
          <div>
            <div style={volStyles.title}>Volumen por fecha</div>
            <div style={volStyles.subtitle}>Evolución de descargas en el rango · {periodLabel}</div>
          </div>
        </div>
        <div style={{ padding: "32px 0", textAlign: "center", color: "#64748B", fontSize: 13, fontWeight: 620 }}>
          Sin datos para graficar.
        </div>
      </div>
    );
  }

  return (
    <div style={volStyles.card}>
      <div style={volStyles.titleRow}>
        <div>
          <div style={volStyles.title}>Volumen por fecha</div>
          <div style={volStyles.subtitle}>Evolución de descargas en el rango · {periodLabel}</div>
        </div>
      </div>

      <div style={volStyles.metaRow}>
        Total <b>{fmtInt(total)}</b>
        <span style={volStyles.sep}>·</span>
        Promedio <b>{fmtInt(avg)}/día</b>
        <span style={volStyles.sep}>·</span>
        Pico <b>{fmtInt(peak)}</b>
        <span style={volStyles.sep}>·</span>
        {dailyMap.length} días
      </div>

      <div style={volStyles.chartWrap}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={volStyles.svg}>
          <defs>
            <linearGradient id={volGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {ySteps.map((step, i) => {
            const y = padT + (1 - step / Math.max(maxVal, 1)) * chartH;
            return (
              <g key={`grid-${i}`}>
                <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#E2E8F0" strokeWidth="0.25" strokeDasharray="1.5 1.5" />
                <text x={padL + 1} y={y - 1} fill="#64748B" fontSize="2.8" fontWeight="800">{step}</text>
              </g>
            );
          })}

          {/* Area fill */}
          {areaPoints && (
            <polygon fill={`url(#${volGradId})`} points={areaPoints} />
          )}

          {/* Line */}
          <polyline
            fill="none"
            stroke={accentColor}
            strokeWidth="1.2"
            points={linePoints}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="0.9"
              fill="#fff"
              stroke={accentColor}
              strokeWidth="0.4"
            >
              <title>{dailyMap[i].label}: {dailyMap[i].value} descargas</title>
            </circle>
          ))}
        </svg>
      </div>

      {/* X-axis labels */}
      <div style={volStyles.xAxis}>
        {dailyMap.length <= 14 ? (
          dailyMap.map((d) => (
            <div key={d.dayKey} style={volStyles.xLabel}>{d.label}</div>
          ))
        ) : (
          // Show every Nth label to avoid crowding
          dailyMap.filter((_, i) => i % Math.ceil(dailyMap.length / 8) === 0 || i === dailyMap.length - 1).map((d) => (
            <div key={d.dayKey} style={volStyles.xLabel}>{d.label}</div>
          ))
        )}
      </div>

      {/* Daily breakdown table */}
      <details style={volStyles.details}>
        <summary style={volStyles.summary}>Ver tabla de datos ({dailyMap.length} días)</summary>
        <div style={volStyles.tableWrap}>
          <table style={volStyles.table}>
            <thead>
              <tr>
                <th style={volStyles.th}>Fecha</th>
                <th style={{ ...volStyles.th, textAlign: "right" }}>Descargas</th>
              </tr>
            </thead>
            <tbody>
              {dailyMap.map((d, i) => (
                <tr key={d.dayKey} style={{ background: i % 2 === 0 ? "#FAFBFE" : "#fff" }}>
                  <td style={volStyles.td}>{d.label}</td>
                  <td style={{ ...volStyles.td, textAlign: "right", fontWeight: 790 }}>{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const volStyles = {
  card: {
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    padding: "20px 20px 16px",
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },
  titleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 700,
    lineHeight: 1.4,
  },
  metaRow: {
    fontSize: 12,
    fontWeight: 750,
    color: "#64748B",
    marginBottom: 14,
  },
  sep: {
    margin: "0 6px",
    color: "#CBD5E1",
  },
  chartWrap: {
    width: "100%",
    height: 220,
    marginBottom: 8,
  },
  svg: {
    width: "100%",
    height: "100%",
    display: "block",
  },
  xAxis: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0 2px",
    marginBottom: 12,
  },
  xLabel: {
    fontSize: 10,
    fontWeight: 620,
    color: "#64748B",
    textAlign: "center",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  details: {
    marginTop: 8,
    borderTop: "1px solid #F1F5F9",
    paddingTop: 10,
  },
  summary: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    cursor: "pointer",
    padding: "4px 0",
  },
  tableWrap: {
    maxHeight: 200,
    overflowY: "auto",
    marginTop: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid #E2E8F0",
    color: "#64748B",
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  td: {
    padding: "6px 8px",
    borderBottom: "1px solid #F8FAFC",
    color: "#0F172A",
    fontWeight: 620,
    fontSize: 13,
  },
};

export default function MetricaRecepcion() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const isMobile = useIsMobile();
  const [activeFilter, setActiveFilter] = useState("hoy");
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [customRange, setCustomRange] = useState(() => defaultRangeDates());
  const [customRangeDraft, setCustomRangeDraft] = useState(() => defaultRangeDates());
  const [customRangeModalOpen, setCustomRangeModalOpen] = useState(false);
  const [customRangeError, setCustomRangeError] = useState("");
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
  const [excludedActions, setExcludedActions] = useState([]);
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
  const [userTimeDetailModal, setUserTimeDetailModal] = useState({
    open: false,
    user: null,
    loading: false,
    error: "",
    items: [],
  });
  const [tendenciasCofersaModal, setTendenciasCofersaModal] = useState({
    open: false,
    loading: false,
    error: "",
    providers: [],
    selectedProvider: null,
    providerActions: [],
  });
  const [providerTimesModalOpen, setProviderTimesModalOpen] = useState(false);
  const [tendenciasEpaModal, setTendenciasEpaModal] = useState({
    open: false,
    loading: false,
    error: "",
    providers: [],
    selectedProvider: null,
    providerActions: [],
  });
  const [cofersaActiveTab, setCofersaActiveTab] = useState("proveedores");
  const [epaActiveTab, setEpaActiveTab] = useState("proveedores");

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
    try {
      const raw = localStorage.getItem(EXCLUDED_ACTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const clean = Array.isArray(parsed)
          ? parsed.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        setExcludedActions(clean);
      }
    } catch (e) {
      console.warn("No se pudo leer configuración local de acciones excluidas.", e);
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

  useEffect(() => {
    try {
      localStorage.setItem(EXCLUDED_ACTIONS_KEY, JSON.stringify(excludedActions));
    } catch (e) {
      console.warn("No se pudo guardar configuración local de acciones excluidas.", e);
    }
  }, [excludedActions]);

  const excludedAndenUsersSet = useMemo(
    () => new Set(excludedAndenUsers.map(normalizeExcludedUserToken).filter(Boolean)),
    [excludedAndenUsers]
  );
  const excludedActionsSet = useMemo(
    () => new Set(excludedActions.map((id) => String(id || "").trim()).filter(Boolean)),
    [excludedActions]
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
            hint: "Mediana del cumplimiento diario (finalizadas ÷ iniciadas por día)",
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
        providerTimes: [],
        providerTimesAcciones: [],
        notes: loadError
          ? [loadError]
          : ["Todavía no hay información disponible para el período seleccionado."],
      }
    );
  }, [dashboardData, loadError]);

  const handleFilterChange = useCallback(
    (nextFilter) => {
      if (nextFilter === "rango") {
        setCustomRangeDraft(customRange);
        setCustomRangeError("");
        setCustomRangeModalOpen(true);
        return;
      }
      setActiveFilter(nextFilter);
    },
    [customRange]
  );

  const applyCustomRange = useCallback(() => {
    const desde = parseYMD(customRangeDraft.desde);
    const hasta = parseYMD(customRangeDraft.hasta);
    if (!desde || !hasta) {
      setCustomRangeError("Seleccioná una fecha desde y una fecha hasta válidas.");
      return;
    }

    const normalized = desde <= hasta
      ? { desde: ymd(desde), hasta: ymd(hasta) }
      : { desde: ymd(hasta), hasta: ymd(desde) };

    setCustomRange(normalized);
    setActiveFilter("rango");
    setCustomRangeModalOpen(false);
    setCustomRangeError("");
  }, [customRangeDraft]);

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
      const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);
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

  const openUserTimeDetail = async (item) => {
    if (!item) return;
    if (!tenantScope.tenantId || !tenantScope.company) {
      setUserTimeDetailModal({
        open: true,
        user: item,
        loading: false,
        error: "No se pudo determinar el tenant para cargar las descargas.",
        items: [],
      });
      return;
    }

    setUserTimeDetailModal({
      open: true,
      user: item,
      loading: true,
      error: "",
      items: [],
    });

    try {
      const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);
      const allowed = new Set(dayKeys);
      const selectedUid = normalizeExcludedUserToken(item?.starterUid);
      const selectedName = normalizeExcludedUserToken(item?.label);

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

      const items = rows
        .filter((row) => {
          const completedAt = row?.completedAt ?? row?.completeAt;
          const completedDate = toDateSafe(completedAt);
          if (!completedDate || !allowed.has(ymd(completedDate))) return false;

          // Filter out excluded actions
          if (excludedActionsSet.has(String(row?.id || "").trim())) {
            return false;
          }

          const who = actionStarterIdentity(row);
          const uidKey = normalizeExcludedUserToken(who.uid);
          const nameKey = normalizeExcludedUserToken(who.label);
          if (excludedAndenUsersSet.has(uidKey) || excludedAndenUsersSet.has(nameKey)) {
            return false;
          }

          return (
            (selectedUid && uidKey === selectedUid) ||
            (selectedName && nameKey === selectedName)
          );
        })
        .map((row) => ({
          ...row,
          _durationMs: actionDurationMs(row),
        }))
        .sort((a, b) => {
          const ad = toDateSafe(a?.completedAt ?? a?.completeAt)?.getTime() || 0;
          const bd = toDateSafe(b?.completedAt ?? b?.completeAt)?.getTime() || 0;
          return bd - ad;
        });

      setUserTimeDetailModal({
        open: true,
        user: item,
        loading: false,
        error: "",
        items,
      });
    } catch (e) {
      console.error("openUserTimeDetail:", e);
      setUserTimeDetailModal({
        open: true,
        user: item,
        loading: false,
        error: "No se pudieron cargar las descargas de este usuario.",
        items: [],
      });
    }
  };

  const toggleActionExclusion = (actionId) => {
    const id = String(actionId || "").trim();
    if (!id) return;

    setExcludedActions((prev) => {
      const set = new Set(prev);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      return Array.from(set);
    });
  };

  const COFERSA_PROVIDERS = [
    "Conducen",
    "Bosch",
    "Lorenzetti",
    "Metalco",
    "Eagle",
    "Bticino",
    "Schneider",
    "Bia alambres",
    "Termoencogibles",
    "Pinos de occidente",
    "Amanco",
    "Henekl",
    "Tres m",
    "Espartaco",
    "Perfex",
    "Sur quimical",
    "Garabito",
  ];

  const normalizeProviderName = (providerName) => {
    const name = String(providerName || "").trim().toLowerCase();
    // Remove numbers, extra spaces, and common suffixes
    return name
      .replace(/\s+\d+$/g, "") // Remove trailing numbers like "2", "3"
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  };

  const matchesProvider = (actionProviderName, baseProviderName) => {
    const normalized = normalizeProviderName(actionProviderName);
    const baseNormalized = baseProviderName.toLowerCase().trim();
    
    // Check if the normalized name starts with or contains the base name
    return normalized.includes(baseNormalized) || baseNormalized.includes(normalized);
  };

  const openTendenciasCofersa = async () => {
    setCofersaActiveTab("proveedores");
    if (!tenantScope.tenantId || !tenantScope.company) {
      setTendenciasCofersaModal({
        open: true,
        loading: false,
        error: "No se pudo determinar el tenant para cargar las tendencias.",
        providers: [],
        selectedProvider: null,
        providerActions: [],
      });
      return;
    }

    setTendenciasCofersaModal({
      open: true,
      loading: true,
      error: "",
      providers: [],
      selectedProvider: null,
      providerActions: [],
    });

    try {
      const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);
      const allowed = new Set(dayKeys);

      const q = query(
        collection(db, "accion_descarga"),
        orderBy("creadoAt", "desc"),
        limit(3000)
      );
      const snap = await getDocs(q);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantScope.tenantId,
        tenantScope.company
      );

      // Filter by date range and completed actions
      const filteredRows = rows.filter((row) => {
        const completedAt = row?.completedAt ?? row?.completeAt;
        const completedDate = toDateSafe(completedAt);
        if (!completedDate || !allowed.has(ymd(completedDate))) return false;
        if (!completedAt) return false; // Only completed actions
        return true;
      });

      // Group by provider
      const providerMap = new Map();

      COFERSA_PROVIDERS.forEach((providerName) => {
        const providerActions = filteredRows.filter((row) => {
          const proveedor = String(row?.proveedorNombre || "").trim();
          return matchesProvider(proveedor, providerName);
        });

        if (providerActions.length > 0) {
          const totalTime = providerActions.reduce((sum, row) => {
            return sum + actionDurationMs(row);
          }, 0);

          const avgTime = providerActions.length > 0 
            ? Math.round(totalTime / providerActions.length) 
            : 0;

          // Get all unique provider name variations found
          const variations = new Set();
          providerActions.forEach((row) => {
            const name = String(row?.proveedorNombre || "").trim();
            if (name) variations.add(name);
          });

          providerMap.set(providerName, {
            name: providerName,
            variations: Array.from(variations),
            count: providerActions.length,
            totalTimeMs: totalTime,
            avgTimeMs: avgTime,
            actions: providerActions.map((row) => ({
              ...row,
              _durationMs: actionDurationMs(row),
            })).sort((a, b) => {
              const ad = toDateSafe(a?.completedAt ?? a?.completeAt)?.getTime() || 0;
              const bd = toDateSafe(b?.completedAt ?? b?.completeAt)?.getTime() || 0;
              return bd - ad;
            }),
          });
        }
      });

      const providers = Array.from(providerMap.values()).sort((a, b) => b.count - a.count);

      setTendenciasCofersaModal({
        open: true,
        loading: false,
        error: "",
        providers,
        selectedProvider: null,
        providerActions: [],
      });
    } catch (e) {
      console.error("openTendenciasCofersa:", e);
      setTendenciasCofersaModal({
        open: true,
        loading: false,
        error: "No se pudieron cargar las tendencias de proveedores.",
        providers: [],
        selectedProvider: null,
        providerActions: [],
      });
    }
  };

  const selectProviderInTendencias = (provider) => {
    setTendenciasCofersaModal((prev) => ({
      ...prev,
      selectedProvider: provider,
      providerActions: provider?.actions || [],
    }));
  };

  const EPA_ANDENES = ["4", "5", "6", "7"];

  const openTendenciasEpa = async () => {
    setEpaActiveTab("proveedores");
    if (!tenantScope.tenantId || !tenantScope.company) {
      setTendenciasEpaModal({
        open: true,
        loading: false,
        error: "No se pudo determinar el tenant para cargar las tendencias.",
        providers: [],
        selectedProvider: null,
        providerActions: [],
      });
      return;
    }

    setTendenciasEpaModal({
      open: true,
      loading: true,
      error: "",
      providers: [],
      selectedProvider: null,
      providerActions: [],
    });

    try {
      const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);
      const allowed = new Set(dayKeys);

      const q = query(
        collection(db, "accion_descarga"),
        orderBy("creadoAt", "desc"),
        limit(3000)
      );
      const snap = await getDocs(q);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantScope.tenantId,
        tenantScope.company
      );

      // Filter by date range, completed actions, and andenes 4-7
      const filteredRows = rows.filter((row) => {
        const completedAt = row?.completedAt ?? row?.completeAt;
        const completedDate = toDateSafe(completedAt);
        if (!completedDate || !allowed.has(ymd(completedDate))) return false;
        if (!completedAt) return false;
        const anden = String(row?.idAnden ?? "").trim();
        if (!EPA_ANDENES.includes(anden)) return false;
        // Exclude providers that belong to Tendencias Cofersa
        const provName = String(row?.proveedorNombre || "").trim();
        if (COFERSA_PROVIDERS.some((cp) => matchesProvider(provName, cp))) return false;
        return true;
      });

      // --- Fuzzy provider name fusion ---
      // Normalize: lowercase, strip trailing numbers/suffixes, collapse spaces
      const normalizeForFusion = (name) => {
        return String(name || "")
          .trim()
          .toLowerCase()
          .replace(/\s+\d+$/g, "")       // "Conducen 2" → "conducen"
          .replace(/\s*s\.?a\.?$/gi, "")  // "Empresa S.A." → "empresa"
          .replace(/\s*s\.?r\.?l\.?$/gi, "")
          .replace(/[.,\-_]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
      };

      // Check if two normalized names are similar enough to merge
      const areSimilarProviders = (a, b) => {
        if (a === b) return true;
        // One contains the other
        if (a.includes(b) || b.includes(a)) return true;
        // Levenshtein-like: if names differ by ≤2 chars and are at least 4 chars long
        if (a.length >= 4 && b.length >= 4) {
          const longer = a.length >= b.length ? a : b;
          const shorter = a.length >= b.length ? b : a;
          if (longer.length - shorter.length <= 2 && longer.startsWith(shorter.slice(0, Math.max(4, shorter.length - 2)))) {
            return true;
          }
        }
        return false;
      };

      // Build groups with fusion
      const fusionGroups = []; // Array of { canonicalKey, canonicalName, variations: Set, count, totalTimeMs, actions }

      for (const row of filteredRows) {
        const rawName = String(row?.proveedorNombre || "").trim();
        const normalized = normalizeForFusion(rawName) || "sin proveedor";

        // Find existing group that matches
        let matchedGroup = null;
        for (const group of fusionGroups) {
          if (areSimilarProviders(group.canonicalKey, normalized)) {
            matchedGroup = group;
            break;
          }
          // Also check against all known variations in the group
          for (const v of group.variationKeys) {
            if (areSimilarProviders(v, normalized)) {
              matchedGroup = group;
              break;
            }
          }
          if (matchedGroup) break;
        }

        if (!matchedGroup) {
          matchedGroup = {
            canonicalKey: normalized,
            canonicalName: rawName || "Sin proveedor",
            variations: new Set(),
            variationKeys: new Set([normalized]),
            count: 0,
            totalTimeMs: 0,
            actions: [],
          };
          fusionGroups.push(matchedGroup);
        }

        if (rawName) matchedGroup.variations.add(rawName);
        matchedGroup.variationKeys.add(normalized);
        matchedGroup.count += 1;
        const dur = actionDurationMs(row);
        matchedGroup.totalTimeMs += dur;
        matchedGroup.actions.push({ ...row, _durationMs: dur });
      }

      const providersRaw = fusionGroups
        .map((g) => {
          // Pick the shortest variation as the display name (most "canonical")
          const variationsArr = Array.from(g.variations);
          const displayName = variationsArr.length > 0
            ? variationsArr.sort((a, b) => a.length - b.length)[0]
            : g.canonicalName;

          return {
            name: displayName,
            variations: variationsArr,
            count: g.count,
            totalTimeMs: g.totalTimeMs,
            avgTimeMs: g.count > 0 ? Math.round(g.totalTimeMs / g.count) : 0,
            actions: g.actions.sort((a, b) => {
              const ad = toDateSafe(a?.completedAt ?? a?.completeAt)?.getTime() || 0;
              const bd = toDateSafe(b?.completedAt ?? b?.completeAt)?.getTime() || 0;
              return bd - ad;
            }),
          };
        });

      // Merge providers that ended up with the same display name
      const mergedMap = new Map();
      for (const p of providersRaw) {
        const key = p.name.toLowerCase().trim();
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          existing.count += p.count;
          existing.totalTimeMs += p.totalTimeMs;
          existing.actions = [...existing.actions, ...p.actions].sort((a, b) => {
            const ad = toDateSafe(a?.completedAt ?? a?.completeAt)?.getTime() || 0;
            const bd = toDateSafe(b?.completedAt ?? b?.completeAt)?.getTime() || 0;
            return bd - ad;
          });
          for (const v of p.variations) existing.variations.add(v);
        } else {
          mergedMap.set(key, {
            name: p.name,
            variations: new Set(p.variations),
            count: p.count,
            totalTimeMs: p.totalTimeMs,
            actions: p.actions,
          });
        }
      }

      const providers = Array.from(mergedMap.values())
        .map((p) => ({
          name: p.name,
          variations: Array.from(p.variations),
          count: p.count,
          totalTimeMs: p.totalTimeMs,
          avgTimeMs: p.count > 0 ? Math.round(p.totalTimeMs / p.count) : 0,
          actions: p.actions,
        }))
        .sort((a, b) => b.count - a.count);

      setTendenciasEpaModal({
        open: true,
        loading: false,
        error: "",
        providers,
        selectedProvider: null,
        providerActions: [],
      });
    } catch (e) {
      console.error("openTendenciasEpa:", e);
      setTendenciasEpaModal({
        open: true,
        loading: false,
        error: "No se pudieron cargar las tendencias EPA.",
        providers: [],
        selectedProvider: null,
        providerActions: [],
      });
    }
  };

  const selectProviderInTendenciasEpa = (provider) => {
    setTendenciasEpaModal((prev) => ({
      ...prev,
      selectedProvider: provider,
      providerActions: provider?.actions || [],
    }));
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

        const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);

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
          selectedDate,
          customRange,
          excludedAndenUsersSet
        );
        const metricDocsForDailySlice = filterDashboardDocsByExcludedUsers(
          filteredDocs,
          excludedAndenUsersSet
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
        built.dailySlice = metricDocsForDailySlice
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
            cumplimientoDiaPct: dailyCompliancePercent(d),
            accionesBultosTotales: Number(d.accionesBultosTotales || 0),
            accionesTiempoTotalMs: Number(d.accionesTiempoTotalMs || 0),
          }));

        try {
          const aq = query(
            collection(db, "accion_descarga"),
            orderBy("creadoAt", "desc"),
            limit(2500)
          );
          const accSnap = await getDocs(aq);
          const accRows = filterByUserScope(
            accSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            tenantId,
            company
          );
          const providerAcciones = filterAccionesParaMetricaProveedor(accRows, {
            allowedDayKeys: dayKeys,
            excludedActionsSet,
            excludedAndenUsersSet,
          });
          built.providerTimesAcciones = providerAcciones;
          built.providerTimes = aggregateProviderTimesByProveedor(providerAcciones);
        } catch (provErr) {
          console.error("loadDashboard providerTimes:", provErr);
          built.providerTimes = [];
          built.providerTimesAcciones = [];
        }

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
  }, [
    activeFilter,
    selectedDate,
    customRange,
    excludedAndenUsersSet,
    excludedActionsSet,
  ]);

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
        const dayKeys = buildDayKeysForFilter(activeFilter, selectedDate, customRange);
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
    customRange,
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

      <Topbar>
        <Brand
          icon={BarChart3}
          title="Recepción"
          subtitle="Panel de métricas"
          onClick={() => nav("/recepcion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/recepcion")}>
            Recepción
          </GhostButton>
          <GhostButton
            icon={Settings}
            onClick={() => setSettingsModalOpen(true)}
            title="Configuración"
            aria-label="Configuración"
          />
        </Topbar.Right>
      </Topbar>

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
                onChange={handleFilterChange}
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 8,
              marginBottom: 6,
            }}
          >
            <div style={{ ...ui.sectionHeaderBlock, marginTop: 0, marginBottom: 0, flex: "1 1 260px", minWidth: 0 }}>
              <div style={ui.sectionOverline}>Equipo</div>
              <div style={ui.sectionTitle}>Desempeño del equipo</div>
              <div style={ui.sectionText}>
                Comparativo de productividad y tiempos por operador. Abrí{" "}
                <b>Tiempos por proveedor</b> para ver duración media agrupada por{" "}
                <code style={ui.inlineCodeHint}>proveedorNombre</code> (descargas cerradas en el período).
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", ...(m ? { width: "100%" } : {}) }}>
              <button
                type="button"
                style={{
                  ...ui.providerTimesOpenBtn,
                  ...(m ? { flex: 1 } : {}),
                  ...(loadingData || loadError ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
                disabled={loadingData || !!loadError}
                onClick={() => setProviderTimesModalOpen(true)}
              >
                <BarChart3 size={18} strokeWidth={2.2} color={ACCENT} aria-hidden />
                Tiempos por proveedor
              </button>
              <button
                type="button"
                style={{
                  ...ui.tendenciasCofersaBtn,
                  ...(m ? { flex: 1 } : {}),
                  ...(loadingData || loadError ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
                disabled={loadingData || !!loadError}
                onClick={openTendenciasCofersa}
                title="Análisis de tendencias para proveedores Cofersa"
              >
                <TrendingUp size={18} strokeWidth={2.2} color="#7C3AED" aria-hidden />
                Tendencias Cofersa
              </button>
              <button
                type="button"
                style={{
                  ...ui.tendenciasEpaBtn,
                  ...(m ? { flex: 1 } : {}),
                  ...(loadingData || loadError ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
                disabled={loadingData || !!loadError}
                onClick={openTendenciasEpa}
                title="Análisis de tendencias EPA — Andenes 4, 5, 6 y 7"
              >
                <TrendingUp size={18} strokeWidth={2.2} color="#0369A1" aria-hidden />
                Tendencia EPA
              </button>
            </div>
          </div>

          <div style={{ ...ui.teamGrid, ...(m ? ui.mTeamGrid : {}) }}>
            <TeamProductivityCard
              data={currentData.teamProductivity}
              periodLabel={currentData.label}
              excludedUsersCount={excludedAndenUsers.length}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />

            <TeamTimesCard
              data={currentData.teamTimes}
              periodLabel={currentData.label}
              onOpenUserDetail={openUserTimeDetail}
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

      {customRangeModalOpen && (
        <div
          style={ui.aperturasModalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-range-modal-title"
        >
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setCustomRangeModalOpen(false)}
            aria-label="Cerrar"
          />

          <div style={ui.infoHelpSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="custom-range-modal-title" style={ui.aperturasSheetTitle}>
                  Rango personalizado
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Seleccioná fecha desde y hasta para recalcular las métricas del panel.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomRangeModalOpen(false)}
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            <div style={ui.settingsSection}>
              <div style={ui.aperturasFiltersRow}>
                <label style={ui.aperturasFilterField}>
                  <span style={ui.aperturasFilterLabel}>Desde</span>
                  <input
                    type="date"
                    value={customRangeDraft.desde}
                    onChange={(e) =>
                      setCustomRangeDraft((prev) => ({
                        ...prev,
                        desde: e.target.value,
                      }))
                    }
                    style={ui.aperturasFilterInput}
                  />
                </label>
                <label style={ui.aperturasFilterField}>
                  <span style={ui.aperturasFilterLabel}>Hasta</span>
                  <input
                    type="date"
                    value={customRangeDraft.hasta}
                    onChange={(e) =>
                      setCustomRangeDraft((prev) => ({
                        ...prev,
                        hasta: e.target.value,
                      }))
                    }
                    style={ui.aperturasFilterInput}
                  />
                </label>
              </div>

              {customRangeError ? (
                <div style={ui.settingsError}>{customRangeError}</div>
              ) : (
                <div style={ui.settingsText}>
                  El rango activo será: <b>{formatRangeLabel(customRangeDraft)}</b>
                </div>
              )}

              <div style={ui.rangeModalActions}>
                <button
                  type="button"
                  style={ui.settingsShowUsersBtn}
                  onClick={() => setCustomRangeDraft(defaultRangeDates())}
                >
                  Últimos 7 días
                </button>
                <button
                  type="button"
                  style={ui.settingsAddBtn}
                  onClick={applyCustomRange}
                >
                  Aplicar rango
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div style={ui.settingsTitle}>Usuarios excluidos de métricas</div>
              <div style={ui.settingsText}>
                Agregá nombre o UID para que ese usuario no aporte en productividad, bultos,
                tiempos, descargas cerradas, iniciadas y cumplimiento del panel.
              </div>
              <div style={ui.settingsWarningText}>
                Esta lista también se aplica al detalle por andén. La configuración se guarda localmente en este navegador.
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
                    Cumplimiento = mediana del % diario (finalizadas ÷ iniciadas por día)
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
                <span style={{ color: "#64748B", fontWeight: 620, fontSize: 13 }}>
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

      {userTimeDetailModal.open && (
        <div
          style={ui.aperturasModalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-time-detail-modal-title"
        >
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() =>
              setUserTimeDetailModal({
                open: false,
                user: null,
                loading: false,
                error: "",
                items: [],
              })
            }
            aria-label="Cerrar"
          />

          <div style={ui.aperturasSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="user-time-detail-modal-title" style={ui.aperturasSheetTitle}>
                  {userTimeDetailModal.user?.label || "Usuario"}
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Descargas cerradas contadas en tiempos · <b>{currentData.label}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setUserTimeDetailModal({
                    open: false,
                    user: null,
                    loading: false,
                    error: "",
                    items: [],
                  })
                }
                style={ui.aperturasSheetCloseBtn}
              >
                Cerrar
              </button>
            </div>

            {userTimeDetailModal.loading ? (
              <div style={ui.aperturasModalLoadingBox}>
                <Loader2
                  size={22}
                  strokeWidth={2.25}
                  color={ACCENT}
                  style={{ animation: "metricaRecepcionSpin 0.75s linear infinite" }}
                />
                <span style={{ color: "#64748B", fontWeight: 620, fontSize: 13 }}>
                  Cargando descargas…
                </span>
              </div>
            ) : userTimeDetailModal.error ? (
              <div style={ui.aperturasModalEmpty}>{userTimeDetailModal.error}</div>
            ) : !userTimeDetailModal.items?.length ? (
              <div style={ui.aperturasModalEmpty}>
                No se encontraron descargas cerradas para este usuario en el período seleccionado.
              </div>
            ) : (
              <>
                <div style={ui.userTimeSummary}>
                  <div style={ui.statusMiniCard}>
                    <div style={ui.statusMiniLabel}>Descargas</div>
                    <div style={ui.statusMiniValue}>
                      {fmtInt(userTimeDetailModal.items.length)}
                    </div>
                  </div>
                  <div style={ui.statusMiniCard}>
                    <div style={ui.statusMiniLabel}>Tiempo total</div>
                    <div style={ui.statusMiniValue}>
                      {fmtMinutesFromMs(sum(userTimeDetailModal.items, (row) => row._durationMs))}
                    </div>
                  </div>
                </div>

                <div style={ui.aperturasListWrap}>
                  <div style={ui.aperturasList}>
                    {userTimeDetailModal.items.map((row) => {
                      const isExcluded = excludedActionsSet.has(String(row?.id || "").trim());
                      const title =
                        String(row?.nombreAccion || "").trim() ||
                        [row?.proveedorNombre, row?.idAnden ? `Andén ${row.idAnden}` : ""]
                          .filter(Boolean)
                          .join(" · ") ||
                        row?.id;
                      const duration = row?._durationMs
                        ? fmtMinutesFromMs(row._durationMs)
                        : row?.totalTimeTxt || "—";

                      return (
                        <div 
                          key={row.id} 
                          style={{
                            ...ui.aperturasRow,
                            ...(isExcluded ? { opacity: 0.5, background: "#F8F9FA" } : {})
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              ...ui.aperturasRowTitle,
                              ...(isExcluded ? { textDecoration: "line-through" } : {})
                            }}>
                              {title}
                              {isExcluded && (
                                <span style={{
                                  marginLeft: "8px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "#94A3B8",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px"
                                }}>
                                  Excluida
                                </span>
                              )}
                            </div>
                            <div style={ui.aperturasRowMeta}>
                              Cerrada {formatDateTimeShort(row?.completedAt ?? row?.completeAt)}
                              {row?.idAnden ? ` · Andén ${row.idAnden}` : ""}
                              {row?.cantidadBultos != null
                                ? ` · ${fmtInt(row.cantidadBultos)} bultos`
                                : ""}
                            </div>
                          </div>
                          <div style={ui.userTimeRowActions}>
                            <span style={{ ...ui.estadoPill, ...ui.estadoPillCompleta }}>
                              {duration}
                            </span>
                            <button
                              type="button"
                              style={{
                                ...ui.kpiEyeBtn,
                                marginLeft: "8px",
                                padding: "6px 10px",
                                fontSize: "12px",
                                fontWeight: 600,
                                background: isExcluded ? ACCENT_SOFT : "#FEF2F2",
                                color: isExcluded ? ACCENT : "#DC2626",
                                border: `1px solid ${isExcluded ? ACCENT : "#FCA5A5"}`,
                                borderRadius: "6px",
                              }}
                              title={isExcluded ? "Incluir en métricas" : "Excluir de métricas"}
                              onClick={() => toggleActionExclusion(row.id)}
                            >
                              {isExcluded ? "Incluir" : "Excluir"}
                            </button>
                            <button
                              type="button"
                              style={ui.aperturasRowLink}
                              onClick={() => {
                                setUserTimeDetailModal({
                                  open: false,
                                  user: null,
                                  loading: false,
                                  error: "",
                                  items: [],
                                });
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
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {providerTimesModalOpen && (
        <ProviderTimesModal
          open
          onClose={() => setProviderTimesModalOpen(false)}
          sourceAcciones={currentData.providerTimesAcciones || []}
          periodLabel={currentData.label}
        />
      )}

      {tendenciasCofersaModal.open && (
        <div style={ui.aperturasModalRoot} role="dialog" aria-modal="true" aria-labelledby="tendencias-cofersa-modal-title">
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setTendenciasCofersaModal({
              open: false,
              loading: false,
              error: "",
              providers: [],
              selectedProvider: null,
              providerActions: [],
            })}
            aria-label="Cerrar"
          />

          <div style={ui.aperturasSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="tendencias-cofersa-modal-title" style={{
                  ...ui.aperturasSheetTitle,
                  background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Tendencias Cofersa
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Análisis de tiempos por proveedor · {currentData.label}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (tendenciasCofersaModal.loading || tendenciasCofersaModal.providers.length === 0) return;
                    
                    try {
                      // Importar dinámicamente ExcelJS
                      const ExcelJS = (await import("exceljs")).default;
                      const wb = new ExcelJS.Workbook();
                      wb.creator = "AppoloDesk";
                      wb.created = new Date();
                      wb.modified = new Date();
                      wb.subject = `Tendencias Cofersa - ${currentData.label}`;
                      
                      // Función auxiliar para formatear fecha
                      const formatFecha = (value) => {
                        if (!value) return "—";
                        try {
                          let fecha;
                          if (typeof value?.toDate === "function") {
                            fecha = value.toDate();
                          } else if (typeof value === "number") {
                            fecha = new Date(value);
                          } else if (typeof value === "string") {
                            fecha = new Date(value);
                          } else {
                            return "—";
                          }
                          
                          if (isNaN(fecha.getTime())) return "—";
                          
                          return fecha.toLocaleString("es-CR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return String(value);
                        }
                      };
                      
                      // Función para estilo de encabezado
                      const styleHeaderRow = (row, cols) => {
                        row.height = 22;
                        for (let c = 1; c <= cols; c++) {
                          const cell = row.getCell(c);
                          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                          cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: "FF7C3AED" },
                          };
                          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
                          cell.border = {
                            top: { style: "thin", color: { argb: "FF7C3AED" } },
                            left: { style: "thin", color: { argb: "FF7C3AED" } },
                            bottom: { style: "thin", color: { argb: "FF6D28D9" } },
                            right: { style: "thin", color: { argb: "FF7C3AED" } },
                          };
                        }
                      };
                      
                      // Función para estilo zebra
                      const zebraRow = (row, cols, odd) => {
                        row.height = 19;
                        const fill = odd ? "FFF5F3FF" : "FFFFFFFF";
                        for (let c = 1; c <= cols; c++) {
                          const cell = row.getCell(c);
                          cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: fill },
                          };
                          cell.border = {
                            top: { style: "hair", color: { argb: "FFE2E8F0" } },
                            left: { style: "hair", color: { argb: "FFE2E8F0" } },
                            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
                            right: { style: "hair", color: { argb: "FFE2E8F0" } },
                          };
                          cell.alignment = { vertical: "middle", wrapText: true };
                          cell.font = { size: 11, color: { argb: "FF0F172A" } };
                        }
                      };
                      
                      // Obtener todas las acciones de todos los proveedores
                      const allProviderActions = new Map();
                      
                      for (const provider of tendenciasCofersaModal.providers) {
                        // Filtrar acciones que coincidan con las variaciones del proveedor
                        const providerVariations = new Set(provider.variations || [provider.name]);
                        const actions = (currentData.providerTimesAcciones || []).filter((accion) => {
                          const provNombre = String(accion?.proveedorNombre || "").trim();
                          return providerVariations.has(provNombre);
                        });
                        
                        allProviderActions.set(provider.name, actions);
                      }
                      
                      // === HOJA RESUMEN (primera hoja) ===
                      const wsResumen = wb.addWorksheet("Resumen", {
                        properties: { tabColor: { argb: "FF7C3AED" } },
                      });
                      wsResumen.columns = [
                        { width: 32 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
                      ];

                      // Título
                      wsResumen.mergeCells("A1:E1");
                      const resTitleCell = wsResumen.getCell("A1");
                      resTitleCell.value = `Tendencias Cofersa — Resumen`;
                      resTitleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
                      resTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
                      resTitleCell.alignment = { vertical: "middle", horizontal: "center" };
                      wsResumen.getRow(1).height = 32;

                      wsResumen.mergeCells("A2:E2");
                      wsResumen.getCell("A2").value = `Período: ${currentData.label}`;
                      wsResumen.getCell("A2").font = { size: 11, color: { argb: "FF64748B" } };
                      wsResumen.getRow(2).height = 20;

                      // KPIs globales
                      let rRes = 4;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Indicadores globales";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF7C3AED" } };
                      rRes += 1;

                      const allActions = tendenciasCofersaModal.providers.flatMap((p) => p.actions || []);
                      const totalDescargas = allActions.length;
                      const totalProveedores = tendenciasCofersaModal.providers.length;
                      const totalTimeGlobal = allActions.reduce((s, a) => s + Number(a?._durationMs || 0), 0);
                      const avgTimeGlobal = totalDescargas > 0 ? Math.round(totalTimeGlobal / totalDescargas) : 0;

                      const resKpis = [
                        ["Total descargas cerradas", totalDescargas],
                        ["Proveedores identificados", totalProveedores],
                        ["Tiempo promedio global", fmtMinutesFromMs(avgTimeGlobal)],
                      ];
                      for (const [label, value] of resKpis) {
                        const row = wsResumen.getRow(rRes);
                        row.getCell(1).value = label;
                        row.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
                        row.getCell(2).value = value;
                        row.height = 20;
                        rRes += 1;
                      }

                      // Ranking de proveedores
                      rRes += 2;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Ranking de proveedores";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF7C3AED" } };
                      rRes += 1;

                      const hdrRanking = wsResumen.getRow(rRes);
                      hdrRanking.getCell(1).value = "Proveedor";
                      hdrRanking.getCell(2).value = "Descargas";
                      hdrRanking.getCell(3).value = "Tiempo promedio";
                      styleHeaderRow(hdrRanking, 3);
                      rRes += 1;

                      for (const provider of tendenciasCofersaModal.providers) {
                        const row = wsResumen.getRow(rRes);
                        row.getCell(1).value = provider.name;
                        row.getCell(2).value = provider.count;
                        row.getCell(3).value = fmtMinutesFromMs(provider.avgTimeMs);
                        zebraRow(row, 3, rRes % 2 === 0);
                        rRes += 1;
                      }

                      // Volumen por fecha
                      rRes += 2;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Tiempo promedio por fecha";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF7C3AED" } };
                      rRes += 1;

                      wsResumen.getCell(`A${rRes}`).value = "Evolución del tiempo promedio de descarga en el rango";
                      wsResumen.getCell(`A${rRes}`).font = { size: 11, color: { argb: "FF64748B" } };
                      rRes += 1;

                      // Group actions by day and compute avg time per day
                      const volDayMap = new Map();
                      for (const act of allActions) {
                        const completedAt = act?.completedAt ?? act?.completeAt;
                        const d = toDateSafe(completedAt);
                        if (!d) continue;
                        const key = ymd(d);
                        if (!volDayMap.has(key)) volDayMap.set(key, { totalMs: 0, count: 0 });
                        const entry = volDayMap.get(key);
                        entry.totalMs += Number(act?._durationMs || 0);
                        entry.count += 1;
                      }
                      const volSorted = Array.from(volDayMap.entries())
                        .map(([dayKey, { totalMs, count }]) => ({
                          dayKey,
                          avgMs: count > 0 ? Math.round(totalMs / count) : 0,
                          count,
                        }))
                        .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
                      const volMaxMs = volSorted.length > 0 ? Math.max(...volSorted.map((d) => d.avgMs)) : 1;

                      rRes += 1;

                      // Visual bar chart using cells
                      const BAR_COLS = 20;
                      wsResumen.columns = [
                        { width: 20 }, { width: 14 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 },
                      ];

                      const hdrVol = wsResumen.getRow(rRes);
                      hdrVol.getCell(1).value = "Fecha";
                      hdrVol.getCell(2).value = "Tiempo promedio";
                      hdrVol.getCell(3).value = "Gráfico";
                      styleHeaderRow(hdrVol, 2);
                      wsResumen.mergeCells(rRes, 3, rRes, 2 + BAR_COLS);
                      const grafCell = hdrVol.getCell(3);
                      grafCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                      grafCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
                      grafCell.alignment = { vertical: "middle", horizontal: "center" };
                      rRes += 1;

                      for (const item of volSorted) {
                        const dt = new Date(`${item.dayKey}T00:00:00`);
                        const label = dt.toLocaleDateString("es-CR", { weekday: "short", day: "2-digit", month: "short" });
                        const row = wsResumen.getRow(rRes);
                        row.height = 16;
                        row.getCell(1).value = label;
                        row.getCell(1).font = { size: 10, color: { argb: "FF475569" } };
                        row.getCell(2).value = fmtMinutesFromMs(item.avgMs);
                        row.getCell(2).font = { size: 10, bold: true, color: { argb: "FF0F172A" } };
                        row.getCell(2).alignment = { horizontal: "center" };

                        // Draw bar using filled cells
                        const barLength = volMaxMs > 0 ? Math.max(1, Math.round((item.avgMs / volMaxMs) * BAR_COLS)) : 1;
                        for (let c = 0; c < BAR_COLS; c++) {
                          const cell = row.getCell(3 + c);
                          if (c < barLength) {
                            cell.fill = {
                              type: "pattern",
                              pattern: "solid",
                              fgColor: { argb: c < barLength * 0.7 ? "FF7C3AED" : "FFA78BFA" },
                            };
                          }
                          cell.border = {
                            top: { style: "hair", color: { argb: "FFF1F5F9" } },
                            bottom: { style: "hair", color: { argb: "FFF1F5F9" } },
                          };
                        }
                        rRes += 1;
                      }

                      // Crear una hoja por cada proveedor
                      const usedSheetNames = new Set(["Resumen"]);
                      for (const provider of tendenciasCofersaModal.providers) {
                        let safeSheetName = provider.name
                          .replace(/[:\\\/\?\*\[\]]/g, "_")
                          .slice(0, 28) + "_PR";
                        if (usedSheetNames.has(safeSheetName)) {
                          let suffix = 2;
                          while (usedSheetNames.has(`${safeSheetName.slice(0, 26)}_${suffix}_PR`)) suffix++;
                          safeSheetName = `${safeSheetName.slice(0, 26)}_${suffix}_PR`;
                        }
                        usedSheetNames.add(safeSheetName);
                        
                        const ws = wb.addWorksheet(safeSheetName, {
                          properties: { tabColor: { argb: "FF7C3AED" } },
                        });
                        
                        ws.columns = [
                          { width: 28 },
                          { width: 18 },
                          { width: 18 },
                          { width: 18 },
                        ];
                        
                        // Título
                        ws.mergeCells("A1:D1");
                        const titleCell = ws.getCell("A1");
                        titleCell.value = `Proveedor: ${provider.name}`;
                        titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
                        titleCell.fill = {
                          type: "pattern",
                          pattern: "solid",
                          fgColor: { argb: "FF7C3AED" },
                        };
                        titleCell.alignment = { vertical: "middle", horizontal: "center" };
                        ws.getRow(1).height = 32;
                        
                        // Resumen
                        let r = 3;
                        ws.mergeCells(`A${r}:D${r}`);
                        const summaryTitle = ws.getCell(`A${r}`);
                        summaryTitle.value = "Resumen de métricas";
                        summaryTitle.font = { bold: true, size: 13, color: { argb: "FF7C3AED" } };
                        r += 1;
                        
                        const metricsData = [
                          ["Descargas totales", provider.count],
                          ["Tiempo promedio", fmtMinutesFromMs(provider.avgTimeMs)],
                          ["Tiempo total", fmtMinutesFromMs(provider.totalTimeMs)],
                        ];
                        
                        for (const [label, value] of metricsData) {
                          const row = ws.getRow(r);
                          row.getCell(1).value = label;
                          row.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
                          row.getCell(2).value = value;
                          ws.mergeCells(r, 2, r, 4);
                          row.height = 20;
                          r += 1;
                        }
                        
                        // Detalle de descargas
                        const actions = allProviderActions.get(provider.name) || [];
                        
                        if (actions.length > 0) {
                          r += 2;
                          ws.mergeCells(`A${r}:G${r}`);
                          const detailTitle = ws.getCell(`A${r}`);
                          detailTitle.value = "Detalle de descargas";
                          detailTitle.font = { bold: true, size: 13, color: { argb: "FF7C3AED" } };
                          r += 1;
                          
                          // Expandir columnas para el detalle
                          ws.columns = [
                            { width: 28 },
                            { width: 18 },
                            { width: 14 },
                            { width: 14 },
                            { width: 18 },
                            { width: 18 },
                          ];
                          
                          const hdrAcciones = ws.getRow(r);
                          hdrAcciones.getCell(1).value = "Fecha cerrada";
                          hdrAcciones.getCell(2).value = "Duración";
                          hdrAcciones.getCell(3).value = "Andén";
                          hdrAcciones.getCell(4).value = "Bultos";
                          hdrAcciones.getCell(5).value = "Iniciado por";
                          hdrAcciones.getCell(6).value = "ID Acción";
                          styleHeaderRow(hdrAcciones, 6);
                          r += 1;
                          
                          // Ordenar acciones por fecha de completado (más reciente primero)
                          const accionesOrdenadas = [...actions].sort((a, b) => {
                            const dateA = a?.completedAt ?? a?.completeAt;
                            const dateB = b?.completedAt ?? b?.completeAt;
                            
                            const getTime = (d) => {
                              if (!d) return 0;
                              if (typeof d?.toDate === "function") return d.toDate().getTime();
                              if (typeof d === "number") return d;
                              if (typeof d === "string") return new Date(d).getTime();
                              return 0;
                            };
                            
                            return getTime(dateB) - getTime(dateA);
                          });
                          
                          for (const accion of accionesOrdenadas) {
                            const row = ws.getRow(r);
                            
                            const fechaCerrada = formatFecha(accion?.completedAt ?? accion?.completeAt);
                            const durMs = Number(accion?.totalTimeMs ?? accion?.tiempoTotalMs ?? accion?.durationMs ?? 0);
                            const anden = String(accion?.idAnden ?? accion?.anden ?? "—");
                            const bultos = Number(accion?.bultos ?? accion?.cantidadBultos ?? 0);
                            const iniciador = String(
                              accion?.starter ?? 
                              accion?.startedByName ?? 
                              accion?.creadoPorNombre ?? 
                              accion?.responsableNombre ?? 
                              "—"
                            );
                            const idAccion = String(accion?.id || "—");
                            
                            row.getCell(1).value = fechaCerrada;
                            row.getCell(2).value = fmtMinutesFromMs(durMs);
                            row.getCell(3).value = anden;
                            row.getCell(4).value = bultos || "—";
                            row.getCell(5).value = iniciador;
                            row.getCell(6).value = idAccion;
                            
                            zebraRow(row, 6, r % 2 === 0);
                            r += 1;
                          }
                          
                          // Agregar autofiltro
                          if (accionesOrdenadas.length > 0) {
                            const startRow = r - accionesOrdenadas.length;
                            ws.autoFilter = {
                              from: { row: startRow - 1, column: 1 },
                              to: { row: r - 1, column: 6 },
                            };
                          }
                        }
                      }
                      
                      // Generar y descargar
                      const buffer = await wb.xlsx.writeBuffer();
                      const blob = new Blob([buffer], {
                        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `tendencias-cofersa_${currentData.label.replace(/\s+/g, "_")}_${Date.now()}.xlsx`;
                      a.rel = "noopener";
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error("Error exportando tendencias:", e);
                      window.alert("No se pudo generar el archivo Excel. Revisa la consola.");
                    }
                  }}
                  disabled={tendenciasCofersaModal.loading || tendenciasCofersaModal.providers.length === 0}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid #7C3AED",
                    background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: tendenciasCofersaModal.loading || tendenciasCofersaModal.providers.length === 0 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: tendenciasCofersaModal.loading || tendenciasCofersaModal.providers.length === 0 ? 0.5 : 1,
                    transition: "all 200ms ease",
                  }}
                  title="Exportar tendencias a Excel"
                >
                  <FileSpreadsheet size={16} strokeWidth={2.2} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => setTendenciasCofersaModal({
                    open: false,
                    loading: false,
                    error: "",
                    providers: [],
                    selectedProvider: null,
                    providerActions: [],
                  })}
                  style={ui.aperturasSheetCloseBtn}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{
              maxHeight: "calc(85vh - 100px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}>
            {tendenciasCofersaModal.loading ? (
              <div style={ui.aperturasModalLoadingBox}>
                <Loader2 size={22} strokeWidth={2.25} color="#7C3AED" style={{ animation: "metricaRecepcionSpin 0.75s linear infinite" }} />
                <span style={{ color: "#64748B", fontWeight: 620, fontSize: 13 }}>Analizando tendencias…</span>
              </div>
            ) : tendenciasCofersaModal.error ? (
              <div style={ui.aperturasModalEmpty}>{tendenciasCofersaModal.error}</div>
            ) : tendenciasCofersaModal.providers.length === 0 ? (
              <div style={ui.aperturasModalEmpty}>
                No se encontraron descargas de proveedores Cofersa en este período.
              </div>
            ) : (
              <>
                {/* Tab chips */}
                <div style={ui.tendenciasTabBar}>
                  <button
                    type="button"
                    onClick={() => setCofersaActiveTab("proveedores")}
                    style={{
                      ...ui.tendenciasChip,
                      ...(cofersaActiveTab === "proveedores" ? ui.tendenciasChipActiveCofersa : {}),
                    }}
                  >
                    Proveedores
                  </button>
                  <button
                    type="button"
                    onClick={() => setCofersaActiveTab("volumen")}
                    style={{
                      ...ui.tendenciasChip,
                      ...(cofersaActiveTab === "volumen" ? ui.tendenciasChipActiveCofersa : {}),
                    }}
                  >
                    Volumen
                  </button>
                </div>

                {cofersaActiveTab === "volumen" ? (
                  <div style={{ padding: "0 18px 18px" }}>
                    <VolumenPorFechaChart
                      actions={tendenciasCofersaModal.providers.flatMap((p) => p.actions || [])}
                      accentColor="#7C3AED"
                      accentSoft="rgba(124,58,237,0.08)"
                      periodLabel={currentData.label}
                    />
                  </div>
                ) : (
                <>
                {!tendenciasCofersaModal.selectedProvider ? (
                  <div style={{ padding: "0 18px 18px" }}>
                    <div style={{
                      marginBottom: 16,
                      padding: 14,
                      borderRadius: 14,
                      background: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
                      border: "1px solid rgba(124,58,237,0.2)",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 620, color: "#6B21A8", marginBottom: 4 }}>
                        {tendenciasCofersaModal.providers.length} proveedores encontrados
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 750, color: "#7C3AED" }}>
                        Haz clic en un proveedor para ver el detalle de sus descargas
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {tendenciasCofersaModal.providers.map((provider) => (
                        <button
                          key={provider.name}
                          type="button"
                          onClick={() => selectProviderInTendencias(provider)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: "1px solid #E7E9F2",
                            background: "#fff",
                            cursor: "pointer",
                            transition: "all 200ms ease",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateX(4px)";
                            e.currentTarget.style.background = "#F5F3FF";
                            e.currentTarget.style.borderColor = "rgba(124,58,237,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateX(0)";
                            e.currentTarget.style.background = "#fff";
                            e.currentTarget.style.borderColor = "#E7E9F2";
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 790, color: "#0F172A", marginBottom: 4 }}>
                              {provider.name}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 620, color: "#64748B", marginBottom: 4 }}>
                              {provider.count} descargas · Promedio: {fmtMinutesFromMs(provider.avgTimeMs)}
                            </div>
                            {provider.variations && provider.variations.length > 1 && (
                              <div style={{ 
                                fontSize: 11, 
                                fontWeight: 750, 
                                color: "#7C3AED",
                                marginTop: 4,
                              }}>
                                Incluye: {provider.variations.join(", ")}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              background: "rgba(124,58,237,0.1)",
                              color: "#7C3AED",
                              fontSize: 12,
                              fontWeight: 700,
                            }}>
                              {fmtMinutesFromMs(provider.totalTimeMs)}
                            </div>
                            <ChevronDown size={18} strokeWidth={2.5} color="#7C3AED" style={{ transform: "rotate(-90deg)" }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "0 18px 18px" }}>
                    <button
                      type="button"
                      onClick={() => selectProviderInTendencias(null)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: "1px solid #E7E9F2",
                        background: "#fff",
                        color: "#0F172A",
                        fontSize: 12,
                        fontWeight: 620,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginBottom: 16,
                      }}
                    >
                      <ArrowLeft size={14} strokeWidth={2.5} />
                      Volver a proveedores
                    </button>

                    <div style={{
                      marginBottom: 16,
                      padding: 16,
                      borderRadius: 16,
                      background: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
                      border: "1px solid rgba(124,58,237,0.2)",
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 790, color: "#6B21A8", marginBottom: 4 }}>
                        {tendenciasCofersaModal.selectedProvider.name}
                      </div>
                      {tendenciasCofersaModal.selectedProvider.variations && 
                       tendenciasCofersaModal.selectedProvider.variations.length > 1 && (
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 750, 
                          color: "#7C3AED",
                          marginBottom: 12,
                        }}>
                          Incluye: {tendenciasCofersaModal.selectedProvider.variations.join(", ")}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 4 }}>
                            Descargas
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {tendenciasCofersaModal.selectedProvider.count}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 4 }}>
                            Tiempo promedio
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {fmtMinutesFromMs(tendenciasCofersaModal.selectedProvider.avgTimeMs)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 4 }}>
                            Tiempo total
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {fmtMinutesFromMs(tendenciasCofersaModal.selectedProvider.totalTimeMs)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={ui.aperturasListWrap}>
                      <div style={ui.aperturasList}>
                        {tendenciasCofersaModal.providerActions.map((row) => {
                          const title =
                            String(row?.nombreAccion || "").trim() ||
                            [row?.proveedorNombre, row?.idAnden ? `Andén ${row.idAnden}` : ""]
                              .filter(Boolean)
                              .join(" · ") ||
                            row?.id;
                          const duration = row?._durationMs
                            ? fmtMinutesFromMs(row._durationMs)
                            : "—";

                          return (
                            <div key={row.id} style={ui.aperturasRow}>
                              <div style={{ minWidth: 0 }}>
                                <div style={ui.aperturasRowTitle}>{title}</div>
                                <div style={ui.aperturasRowMeta}>
                                  Cerrada {formatDateTimeShort(row?.completedAt ?? row?.completeAt)}
                                  {row?.idAnden ? ` · Andén ${row.idAnden}` : ""}
                                  {row?.cantidadBultos != null
                                    ? ` · ${fmtInt(row.cantidadBultos)} bultos`
                                    : ""}
                                </div>
                              </div>
                              <div style={ui.userTimeRowActions}>
                                <span style={{
                                  ...ui.estadoPill,
                                  background: "rgba(124,58,237,0.1)",
                                  color: "#7C3AED",
                                  border: "1px solid rgba(124,58,237,0.2)",
                                }}>
                                  {duration}
                                </span>
                                <button
                                  type="button"
                                  style={ui.aperturasRowLink}
                                  onClick={() => {
                                    setTendenciasCofersaModal({
                                      open: false,
                                      loading: false,
                                      error: "",
                                      providers: [],
                                      selectedProvider: null,
                                      providerActions: [],
                                    });
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
                    </div>
                  </div>
                )}
              </>
              )}
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {tendenciasEpaModal.open && (
        <div style={ui.aperturasModalRoot} role="dialog" aria-modal="true" aria-labelledby="tendencias-epa-modal-title">
          <button
            type="button"
            style={ui.aperturasModalBackdrop}
            onClick={() => setTendenciasEpaModal({
              open: false,
              loading: false,
              error: "",
              providers: [],
              selectedProvider: null,
              providerActions: [],
            })}
            aria-label="Cerrar"
          />

          <div style={ui.aperturasSheet}>
            <div style={ui.aperturasSheetHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="tendencias-epa-modal-title" style={{
                  ...ui.aperturasSheetTitle,
                  background: "linear-gradient(135deg, #0369A1 0%, #38BDF8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Tendencia EPA
                </div>
                <div style={ui.aperturasSheetSubtitle}>
                  Análisis de tiempos por proveedor en Andenes 4, 5, 6 y 7 · {currentData.label}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (tendenciasEpaModal.loading || tendenciasEpaModal.providers.length === 0) return;
                    
                    try {
                      const ExcelJS = (await import("exceljs")).default;
                      const wb = new ExcelJS.Workbook();
                      wb.creator = "AppoloDesk";
                      wb.created = new Date();
                      wb.modified = new Date();
                      wb.subject = `Tendencia EPA - ${currentData.label}`;
                      
                      const formatFecha = (value) => {
                        if (!value) return "—";
                        try {
                          let fecha;
                          if (typeof value?.toDate === "function") fecha = value.toDate();
                          else if (typeof value === "number") fecha = new Date(value);
                          else if (typeof value === "string") fecha = new Date(value);
                          else return "—";
                          if (isNaN(fecha.getTime())) return "—";
                          return fecha.toLocaleString("es-CR", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          });
                        } catch { return String(value); }
                      };
                      
                      const styleHeaderRow = (row, cols) => {
                        row.height = 22;
                        for (let c = 1; c <= cols; c++) {
                          const cell = row.getCell(c);
                          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
                          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
                          cell.border = {
                            top: { style: "thin", color: { argb: "FF0369A1" } },
                            left: { style: "thin", color: { argb: "FF0369A1" } },
                            bottom: { style: "thin", color: { argb: "FF075985" } },
                            right: { style: "thin", color: { argb: "FF0369A1" } },
                          };
                        }
                      };
                      
                      const zebraRow = (row, cols, odd) => {
                        row.height = 19;
                        const fill = odd ? "FFF0F9FF" : "FFFFFFFF";
                        for (let c = 1; c <= cols; c++) {
                          const cell = row.getCell(c);
                          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
                          cell.border = {
                            top: { style: "hair", color: { argb: "FFE2E8F0" } },
                            left: { style: "hair", color: { argb: "FFE2E8F0" } },
                            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
                            right: { style: "hair", color: { argb: "FFE2E8F0" } },
                          };
                          cell.alignment = { vertical: "middle", wrapText: true };
                          cell.font = { size: 11, color: { argb: "FF0F172A" } };
                        }
                      };
                      
                      // === HOJA RESUMEN (primera hoja) ===
                      const wsResumen = wb.addWorksheet("Resumen", {
                        properties: { tabColor: { argb: "FF0369A1" } },
                      });
                      wsResumen.columns = [
                        { width: 32 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
                      ];

                      wsResumen.mergeCells("A1:E1");
                      const resTitleCell = wsResumen.getCell("A1");
                      resTitleCell.value = `Tendencia EPA — Resumen (Andenes 4-7)`;
                      resTitleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
                      resTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
                      resTitleCell.alignment = { vertical: "middle", horizontal: "center" };
                      wsResumen.getRow(1).height = 32;

                      wsResumen.mergeCells("A2:E2");
                      wsResumen.getCell("A2").value = `Período: ${currentData.label}`;
                      wsResumen.getCell("A2").font = { size: 11, color: { argb: "FF64748B" } };
                      wsResumen.getRow(2).height = 20;

                      let rRes = 4;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Indicadores globales";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF0369A1" } };
                      rRes += 1;

                      const allActions = tendenciasEpaModal.providers.flatMap((p) => p.actions || []);
                      const totalDescargas = allActions.length;
                      const totalProveedores = tendenciasEpaModal.providers.length;
                      const totalTimeGlobal = allActions.reduce((s, a) => s + Number(a?._durationMs || 0), 0);
                      const avgTimeGlobal = totalDescargas > 0 ? Math.round(totalTimeGlobal / totalDescargas) : 0;

                      const resKpis = [
                        ["Total descargas cerradas", totalDescargas],
                        ["Proveedores identificados", totalProveedores],
                        ["Tiempo promedio global", fmtMinutesFromMs(avgTimeGlobal)],
                        ["Andenes incluidos", "4, 5, 6, 7"],
                      ];
                      for (const [label, value] of resKpis) {
                        const row = wsResumen.getRow(rRes);
                        row.getCell(1).value = label;
                        row.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
                        row.getCell(2).value = value;
                        row.height = 20;
                        rRes += 1;
                      }

                      rRes += 2;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Ranking de proveedores";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF0369A1" } };
                      rRes += 1;

                      const hdrRanking = wsResumen.getRow(rRes);
                      hdrRanking.getCell(1).value = "Proveedor";
                      hdrRanking.getCell(2).value = "Descargas";
                      hdrRanking.getCell(3).value = "Tiempo promedio";
                      styleHeaderRow(hdrRanking, 3);
                      rRes += 1;

                      for (const provider of tendenciasEpaModal.providers) {
                        const row = wsResumen.getRow(rRes);
                        row.getCell(1).value = provider.name;
                        row.getCell(2).value = provider.count;
                        row.getCell(3).value = fmtMinutesFromMs(provider.avgTimeMs);
                        zebraRow(row, 3, rRes % 2 === 0);
                        rRes += 1;
                      }

                      rRes += 2;
                      wsResumen.mergeCells(`A${rRes}:E${rRes}`);
                      wsResumen.getCell(`A${rRes}`).value = "Tiempo promedio por fecha";
                      wsResumen.getCell(`A${rRes}`).font = { bold: true, size: 13, color: { argb: "FF0369A1" } };
                      rRes += 1;

                      wsResumen.getCell(`A${rRes}`).value = "Evolución del tiempo promedio de descarga (Andenes 4-7)";
                      wsResumen.getCell(`A${rRes}`).font = { size: 11, color: { argb: "FF64748B" } };
                      rRes += 1;

                      // Group actions by day and compute avg time per day
                      const volDayMap = new Map();
                      for (const act of allActions) {
                        const completedAt = act?.completedAt ?? act?.completeAt;
                        const d = toDateSafe(completedAt);
                        if (!d) continue;
                        const key = ymd(d);
                        if (!volDayMap.has(key)) volDayMap.set(key, { totalMs: 0, count: 0 });
                        const entry = volDayMap.get(key);
                        entry.totalMs += Number(act?._durationMs || 0);
                        entry.count += 1;
                      }
                      const volSorted = Array.from(volDayMap.entries())
                        .map(([dayKey, { totalMs, count }]) => ({
                          dayKey,
                          avgMs: count > 0 ? Math.round(totalMs / count) : 0,
                          count,
                        }))
                        .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
                      const volMaxMs = volSorted.length > 0 ? Math.max(...volSorted.map((d) => d.avgMs)) : 1;

                      rRes += 1;

                      // Visual bar chart using cells
                      const BAR_COLS = 20;
                      wsResumen.columns = [
                        { width: 20 }, { width: 14 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 },
                        { width: 3 }, { width: 3 },
                      ];

                      const hdrVol = wsResumen.getRow(rRes);
                      hdrVol.getCell(1).value = "Fecha";
                      hdrVol.getCell(2).value = "Tiempo promedio";
                      hdrVol.getCell(3).value = "Gráfico";
                      styleHeaderRow(hdrVol, 2);
                      wsResumen.mergeCells(rRes, 3, rRes, 2 + BAR_COLS);
                      const grafCell = hdrVol.getCell(3);
                      grafCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                      grafCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
                      grafCell.alignment = { vertical: "middle", horizontal: "center" };
                      rRes += 1;

                      for (const item of volSorted) {
                        const dt = new Date(`${item.dayKey}T00:00:00`);
                        const label = dt.toLocaleDateString("es-CR", { weekday: "short", day: "2-digit", month: "short" });
                        const row = wsResumen.getRow(rRes);
                        row.height = 16;
                        row.getCell(1).value = label;
                        row.getCell(1).font = { size: 10, color: { argb: "FF475569" } };
                        row.getCell(2).value = fmtMinutesFromMs(item.avgMs);
                        row.getCell(2).font = { size: 10, bold: true, color: { argb: "FF0F172A" } };
                        row.getCell(2).alignment = { horizontal: "center" };

                        const barLength = volMaxMs > 0 ? Math.max(1, Math.round((item.avgMs / volMaxMs) * BAR_COLS)) : 1;
                        for (let c = 0; c < BAR_COLS; c++) {
                          const cell = row.getCell(3 + c);
                          if (c < barLength) {
                            cell.fill = {
                              type: "pattern",
                              pattern: "solid",
                              fgColor: { argb: c < barLength * 0.7 ? "FF0369A1" : "FF7DD3FC" },
                            };
                          }
                          cell.border = {
                            top: { style: "hair", color: { argb: "FFF1F5F9" } },
                            bottom: { style: "hair", color: { argb: "FFF1F5F9" } },
                          };
                        }
                        rRes += 1;
                      }

                      // Crear una hoja por cada proveedor
                      const usedSheetNames = new Set(["Resumen"]);
                      for (const provider of tendenciasEpaModal.providers) {
                        let safeSheetName = provider.name
                          .replace(/[:\\\/\?\*\[\]]/g, "_")
                          .slice(0, 28) + "_EP";
                        // Avoid duplicate sheet names
                        if (usedSheetNames.has(safeSheetName)) {
                          let suffix = 2;
                          while (usedSheetNames.has(`${safeSheetName.slice(0, 26)}_${suffix}_EP`)) suffix++;
                          safeSheetName = `${safeSheetName.slice(0, 26)}_${suffix}_EP`;
                        }
                        usedSheetNames.add(safeSheetName);
                        
                        const ws = wb.addWorksheet(safeSheetName, {
                          properties: { tabColor: { argb: "FF0369A1" } },
                        });
                        
                        ws.columns = [
                          { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
                        ];
                        
                        ws.mergeCells("A1:D1");
                        const titleCell = ws.getCell("A1");
                        titleCell.value = `Proveedor: ${provider.name}`;
                        titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
                        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
                        titleCell.alignment = { vertical: "middle", horizontal: "center" };
                        ws.getRow(1).height = 32;
                        
                        let r = 3;
                        ws.mergeCells(`A${r}:D${r}`);
                        const summaryTitle = ws.getCell(`A${r}`);
                        summaryTitle.value = "Resumen de métricas (Andenes 4-7)";
                        summaryTitle.font = { bold: true, size: 13, color: { argb: "FF0369A1" } };
                        r += 1;
                        
                        const metricsData = [
                          ["Descargas totales", provider.count],
                          ["Tiempo promedio", fmtMinutesFromMs(provider.avgTimeMs)],
                          ["Tiempo total", fmtMinutesFromMs(provider.totalTimeMs)],
                        ];
                        
                        for (const [label, value] of metricsData) {
                          const row = ws.getRow(r);
                          row.getCell(1).value = label;
                          row.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
                          row.getCell(2).value = value;
                          ws.mergeCells(r, 2, r, 4);
                          row.height = 20;
                          r += 1;
                        }
                        
                        const actions = provider.actions || [];
                        if (actions.length > 0) {
                          r += 2;
                          ws.mergeCells(`A${r}:G${r}`);
                          const detailTitle = ws.getCell(`A${r}`);
                          detailTitle.value = "Detalle de descargas";
                          detailTitle.font = { bold: true, size: 13, color: { argb: "FF0369A1" } };
                          r += 1;
                          
                          ws.columns = [
                            { width: 28 }, { width: 18 },
                            { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 },
                          ];
                          
                          const hdrAcciones = ws.getRow(r);
                          hdrAcciones.getCell(1).value = "Fecha cerrada";
                          hdrAcciones.getCell(2).value = "Duración";
                          hdrAcciones.getCell(3).value = "Andén";
                          hdrAcciones.getCell(4).value = "Bultos";
                          hdrAcciones.getCell(5).value = "Iniciado por";
                          hdrAcciones.getCell(6).value = "ID Acción";
                          styleHeaderRow(hdrAcciones, 6);
                          r += 1;
                          
                          for (const accion of actions) {
                            const row = ws.getRow(r);
                            row.getCell(1).value = formatFecha(accion?.completedAt ?? accion?.completeAt);
                            row.getCell(2).value = fmtMinutesFromMs(Number(accion?.totalTimeMs ?? accion?.tiempoTotalMs ?? accion?.durationMs ?? 0));
                            row.getCell(3).value = String(accion?.idAnden ?? "—");
                            row.getCell(4).value = Number(accion?.bultos ?? accion?.cantidadBultos ?? 0) || "—";
                            row.getCell(5).value = String(accion?.starter ?? accion?.startedByName ?? accion?.creadoPorNombre ?? accion?.responsableNombre ?? "—");
                            row.getCell(6).value = String(accion?.id || "—");
                            zebraRow(row, 6, r % 2 === 0);
                            r += 1;
                          }
                          
                          if (actions.length > 0) {
                            const startRow = r - actions.length;
                            ws.autoFilter = {
                              from: { row: startRow - 1, column: 1 },
                              to: { row: r - 1, column: 6 },
                            };
                          }
                        }
                      }
                      
                      const buffer = await wb.xlsx.writeBuffer();
                      const blob = new Blob([buffer], {
                        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `tendencia-epa_${currentData.label.replace(/\s+/g, "_")}_${Date.now()}.xlsx`;
                      a.rel = "noopener";
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error("Error exportando tendencias EPA:", e);
                      window.alert("No se pudo generar el archivo Excel. Revisa la consola.");
                    }
                  }}
                  disabled={tendenciasEpaModal.loading || tendenciasEpaModal.providers.length === 0}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid #0369A1",
                    background: "linear-gradient(135deg, #0369A1 0%, #38BDF8 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: tendenciasEpaModal.loading || tendenciasEpaModal.providers.length === 0 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: tendenciasEpaModal.loading || tendenciasEpaModal.providers.length === 0 ? 0.5 : 1,
                    transition: "all 200ms ease",
                  }}
                  title="Exportar tendencias EPA a Excel"
                >
                  <FileSpreadsheet size={16} strokeWidth={2.2} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => setTendenciasEpaModal({
                    open: false,
                    loading: false,
                    error: "",
                    providers: [],
                    selectedProvider: null,
                    providerActions: [],
                  })}
                  style={ui.aperturasSheetCloseBtn}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{
              maxHeight: "calc(85vh - 100px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}>
            {tendenciasEpaModal.loading ? (
              <div style={ui.aperturasModalLoadingBox}>
                <Loader2 size={22} strokeWidth={2.25} color="#0369A1" style={{ animation: "metricaRecepcionSpin 0.75s linear infinite" }} />
                <span style={{ color: "#64748B", fontWeight: 620, fontSize: 13 }}>Analizando tendencias EPA…</span>
              </div>
            ) : tendenciasEpaModal.error ? (
              <div style={ui.aperturasModalEmpty}>{tendenciasEpaModal.error}</div>
            ) : tendenciasEpaModal.providers.length === 0 ? (
              <div style={ui.aperturasModalEmpty}>
                No se encontraron descargas en Andenes 4, 5, 6 y 7 para este período.
              </div>
            ) : (
              <>
                {/* Tab chips */}
                <div style={ui.tendenciasTabBar}>
                  <button
                    type="button"
                    onClick={() => setEpaActiveTab("proveedores")}
                    style={{
                      ...ui.tendenciasChip,
                      ...(epaActiveTab === "proveedores" ? ui.tendenciasChipActiveEpa : {}),
                    }}
                  >
                    Proveedores
                  </button>
                  <button
                    type="button"
                    onClick={() => setEpaActiveTab("volumen")}
                    style={{
                      ...ui.tendenciasChip,
                      ...(epaActiveTab === "volumen" ? ui.tendenciasChipActiveEpa : {}),
                    }}
                  >
                    Volumen
                  </button>
                </div>

                {epaActiveTab === "volumen" ? (
                  <div style={{ padding: "0 18px 18px" }}>
                    <VolumenPorFechaChart
                      actions={tendenciasEpaModal.providers.flatMap((p) => p.actions || [])}
                      accentColor="#0369A1"
                      accentSoft="rgba(3,105,161,0.08)"
                      periodLabel={currentData.label}
                    />
                  </div>
                ) : (
                <>
                {!tendenciasEpaModal.selectedProvider ? (
                  <div style={{ padding: "0 18px 18px" }}>
                    <div style={{
                      marginBottom: 16,
                      padding: 14,
                      borderRadius: 14,
                      background: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)",
                      border: "1px solid rgba(3,105,161,0.2)",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 620, color: "#075985", marginBottom: 4 }}>
                        {tendenciasEpaModal.providers.length} proveedores encontrados
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 750, color: "#0369A1" }}>
                        Descargas en Andenes 4, 5, 6 y 7 — Haz clic en un proveedor para ver el detalle
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {tendenciasEpaModal.providers.map((provider, provIdx) => (
                        <button
                          key={`${provider.name}-${provIdx}`}
                          type="button"
                          onClick={() => selectProviderInTendenciasEpa(provider)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: "1px solid #E7E9F2",
                            background: "#fff",
                            cursor: "pointer",
                            transition: "all 200ms ease",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateX(4px)";
                            e.currentTarget.style.background = "#F0F9FF";
                            e.currentTarget.style.borderColor = "rgba(3,105,161,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateX(0)";
                            e.currentTarget.style.background = "#fff";
                            e.currentTarget.style.borderColor = "#E7E9F2";
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 790, color: "#0F172A", marginBottom: 4 }}>
                              {provider.name}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 620, color: "#64748B", marginBottom: 4 }}>
                              {provider.count} descargas · Promedio: {fmtMinutesFromMs(provider.avgTimeMs)}
                            </div>
                            {provider.variations && provider.variations.length > 1 && (
                              <div style={{ 
                                fontSize: 11, 
                                fontWeight: 750, 
                                color: "#0369A1",
                                marginTop: 4,
                              }}>
                                Incluye: {provider.variations.join(", ")}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              background: "rgba(3,105,161,0.1)",
                              color: "#0369A1",
                              fontSize: 12,
                              fontWeight: 700,
                            }}>
                              {fmtMinutesFromMs(provider.totalTimeMs)}
                            </div>
                            <ChevronDown size={18} strokeWidth={2.5} color="#0369A1" style={{ transform: "rotate(-90deg)" }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "0 18px 18px" }}>
                    <button
                      type="button"
                      onClick={() => selectProviderInTendenciasEpa(null)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: "1px solid #E7E9F2",
                        background: "#fff",
                        color: "#0F172A",
                        fontSize: 12,
                        fontWeight: 620,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginBottom: 16,
                      }}
                    >
                      <ArrowLeft size={14} strokeWidth={2.5} />
                      Volver a proveedores
                    </button>

                    <div style={{
                      marginBottom: 16,
                      padding: 16,
                      borderRadius: 16,
                      background: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)",
                      border: "1px solid rgba(3,105,161,0.2)",
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 790, color: "#075985", marginBottom: 4 }}>
                        {tendenciasEpaModal.selectedProvider.name}
                      </div>
                      {tendenciasEpaModal.selectedProvider.variations && 
                       tendenciasEpaModal.selectedProvider.variations.length > 1 && (
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 750, 
                          color: "#0369A1",
                          marginBottom: 12,
                        }}>
                          Incluye: {tendenciasEpaModal.selectedProvider.variations.join(", ")}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#0369A1", textTransform: "uppercase", marginBottom: 4 }}>
                            Descargas
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {tendenciasEpaModal.selectedProvider.count}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#0369A1", textTransform: "uppercase", marginBottom: 4 }}>
                            Tiempo promedio
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {fmtMinutesFromMs(tendenciasEpaModal.selectedProvider.avgTimeMs)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#0369A1", textTransform: "uppercase", marginBottom: 4 }}>
                            Tiempo total
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 790, color: "#0F172A" }}>
                            {fmtMinutesFromMs(tendenciasEpaModal.selectedProvider.totalTimeMs)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={ui.aperturasListWrap}>
                      <div style={ui.aperturasList}>
                        {tendenciasEpaModal.providerActions.map((row) => {
                          const title =
                            String(row?.nombreAccion || "").trim() ||
                            [row?.proveedorNombre, row?.idAnden ? `Andén ${row.idAnden}` : ""]
                              .filter(Boolean)
                              .join(" · ") ||
                            row?.id;
                          const duration = row?._durationMs
                            ? fmtMinutesFromMs(row._durationMs)
                            : "—";

                          return (
                            <div key={row.id} style={ui.aperturasRow}>
                              <div style={{ minWidth: 0 }}>
                                <div style={ui.aperturasRowTitle}>{title}</div>
                                <div style={ui.aperturasRowMeta}>
                                  Cerrada {formatDateTimeShort(row?.completedAt ?? row?.completeAt)}
                                  {row?.idAnden ? ` · Andén ${row.idAnden}` : ""}
                                  {row?.cantidadBultos != null
                                    ? ` · ${fmtInt(row.cantidadBultos)} bultos`
                                    : ""}
                                </div>
                              </div>
                              <div style={ui.userTimeRowActions}>
                                <span style={{
                                  ...ui.estadoPill,
                                  background: "rgba(3,105,161,0.1)",
                                  color: "#0369A1",
                                  border: "1px solid rgba(3,105,161,0.2)",
                                }}>
                                  {duration}
                                </span>
                                <button
                                  type="button"
                                  style={ui.aperturasRowLink}
                                  onClick={() => {
                                    setTendenciasEpaModal({
                                      open: false,
                                      loading: false,
                                      error: "",
                                      providers: [],
                                      selectedProvider: null,
                                      providerActions: [],
                                    });
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
                    </div>
                  </div>
                )}
              </>
              )}
              </>
            )}
            </div>
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
                <span style={{ color: "#64748B", fontWeight: 620, fontSize: 13 }}>Cargando…</span>
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
  brandTitle: { fontWeight: 790, fontSize: 14, color: "#0F172A" },
  brandSub: { fontWeight: 620, fontSize: 12, color: SLATE },

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
    fontWeight: 620,
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
    gap: 22,
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
    fontWeight: 700,
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
    fontWeight: 700,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 620,
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
    fontWeight: 790,
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
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    alignContent: "start",
    gap: 12,
  },

  heroNoteTitle: {
    fontWeight: 820,
    fontSize: 22,
    lineHeight: 1.1,
    color: "#0F172A",
  },

  heroNoteText: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 620,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
  },

  sectionTitle: {
    fontWeight: 820,
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 2,
  },

  sectionText: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 620,
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
    fontWeight: 620,
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
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
    minHeight: 124,
    display: "grid",
    alignContent: "start",
  },

  kpiLabel: {
    color: "#64748B",
    fontWeight: 700,
    fontSize: 13,
  },

  kpiValue: {
    color: "#0F172A",
    fontWeight: 850,
    fontSize: 30,
    lineHeight: 1.05,
    marginBottom: 10,
    letterSpacing: -0.6,
  },

  kpiMeta: {
    color: "#64748B",
    fontWeight: 620,
    fontSize: 12,
    lineHeight: 1.4,
    marginBottom: 8,
  },

  kpiHint: {
    color: ACCENT,
    fontWeight: 700,
    fontSize: 12,
    lineHeight: 1.35,
  },

  kpiPanel: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 18,
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
    fontWeight: 820,
    fontSize: 15,
    color: "#0F172A",
  },

  kpiPanelText: {
    color: "#64748B",
    fontWeight: 620,
    fontSize: 12,
    lineHeight: 1.45,
  },

  kpiPanelMeta: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 620,
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
    fontWeight: 700,
    letterSpacing: 0.06,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },

  execSummaryHeadline: {
    fontSize: "clamp(16px, 2.6vw, 19px)",
    fontWeight: 790,
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
    fontWeight: 620,
  },

  execSummaryStatusBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    color: "#334155",
    fontWeight: 700,
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
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.04,
  },

  execSummaryPillarValue: {
    fontSize: 16,
    fontWeight: 790,
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
    fontWeight: 790,
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
    fontWeight: 620,
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
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.04,
    marginBottom: 4,
  },

  snapshotValue: {
    fontSize: 15,
    fontWeight: 790,
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
    fontWeight: 820,
    fontSize: 16,
    color: "#0F172A",
  },

  chartSubtitle: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 700,
    color: "#0F172A",
  },

  barLabel: {
    fontSize: 12,
    fontWeight: 620,
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
    fontWeight: 790,
    color: "#0F172A",
    lineHeight: 1.2,
  },

  teamMeta: {
    fontSize: 12,
    fontWeight: 620,
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
    fontWeight: 820,
    color: ACCENT,
    lineHeight: 1,
  },

  teamValueLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  teamTimeValue: {
    fontSize: 14,
    fontWeight: 790,
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
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 820,
    fontSize: 24,
    color: "#0F172A",
    lineHeight: 1,
  },

  donutText: {
    fontWeight: 620,
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
    fontWeight: 700,
    color: "#0F172A",
  },

  userRowValue: {
    fontSize: 12,
    fontWeight: 700,
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
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    padding: 18,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },

  bottomTitle: {
    fontWeight: 820,
    fontSize: 18,
    color: "#0F172A",
    lineHeight: 1.15,
  },

  bottomText: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 620,
    fontSize: 13,
  },

  noDataBanner: {
    border: "1px solid #B6E3D8",
    background: "#F1FBF8",
    color: "#0F766E",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 620,
    fontSize: 13,
  },

  emptyMiniText: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 700,
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
    fontWeight: 790,
    fontSize: 11,
    whiteSpace: "nowrap",
  },

  sectionOverline: {
    color: ACCENT,
    fontWeight: 790,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  sectionOverlineLg: {
    color: ACCENT,
    fontWeight: 790,
    fontSize: 13,
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },

  filtersPanel: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 18,
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
    fontWeight: 820,
    fontSize: 15,
    color: "#0F172A",
  },

  filtersPanelText: {
    color: "#64748B",
    fontWeight: 620,
    fontSize: 12,
    lineHeight: 1.45,
  },

  filtersPanelMeta: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E7E9F2",
    color: "#475569",
    fontWeight: 620,
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
    fontWeight: 790,
    fontSize: 12,
    lineHeight: 1.1,
  },

  filterBtnHint: {
    fontWeight: 620,
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
    borderRadius: 18,
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
    fontWeight: 820,
    fontSize: 16,
    color: "#0F172A",
  },

  alertCardSubtitle: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 790,
    fontSize: 13,
    lineHeight: 1.2,
  },

  alertDescription: {
    color: "#64748B",
    fontWeight: 620,
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
    fontWeight: 700,
    fontSize: 12,
  },

  statusHeroValue: {
    color: "#0F172A",
    fontWeight: 850,
    fontSize: 34,
    lineHeight: 1,
    letterSpacing: -0.8,
  },

  statusHeroText: {
    color: "#64748B",
    fontWeight: 620,
    fontSize: 12,
    lineHeight: 1.4,
  },

  statusMiniGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  userTimeSummary: {
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
    fontWeight: 700,
    fontSize: 11,
    lineHeight: 1.3,
  },

  statusMiniValue: {
    color: "#0F172A",
    fontWeight: 820,
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
    fontWeight: 790,
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
    fontWeight: 700,
    color: "#0F172A",
  },

  mixValue: {
    fontSize: 12,
    fontWeight: 700,
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
    fontWeight: 790,
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
    fontWeight: 700,
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
  cardHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
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
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 64px rgba(15,23,42,0.2)",
    padding: 16,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflow: "hidden",
  },

  providerTimesSheet: {
    position: "relative",
    zIndex: 1,
    width: "min(780px, calc(100vw - 32px))",
    maxHeight: "min(calc(100vh - 32px), 760px)",
    background: "#fff",
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 64px rgba(15,23,42,0.2)",
    padding: 16,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflow: "hidden",
  },

  providerTimesListOuter: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 4,
    WebkitOverflowScrolling: "touch",
  },

  providerTimesOpenBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(8,159,138,0.28)",
    background: "#fff",
    color: "#0F172A",
    fontWeight: 790,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
    flexShrink: 0,
  },

  inlineCodeHint: {
    fontSize: 11,
    fontWeight: 620,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    background: "#F1F5F9",
    padding: "2px 6px",
    borderRadius: 6,
    color: "#334155",
  },

  tendenciasCofersaBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(124,58,237,0.28)",
    background: "linear-gradient(135deg, #FDFBFF 0%, #F5F3FF 100%)",
    color: "#0F172A",
    fontWeight: 790,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 24px rgba(124,58,237,0.12)",
    flexShrink: 0,
    transition: "all 200ms ease",
  },

  tendenciasEpaBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(3,105,161,0.28)",
    background: "linear-gradient(135deg, #F8FDFF 0%, #F0F9FF 100%)",
    color: "#0F172A",
    fontWeight: 790,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 24px rgba(3,105,161,0.12)",
    flexShrink: 0,
    transition: "all 200ms ease",
  },

  tendenciasTabBar: {
    display: "flex",
    gap: 8,
    padding: "12px 18px 0",
    marginBottom: 14,
  },
  tendenciasChip: {
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid #D1D5DB",
    background: "#F9FAFB",
    color: "#475569",
    fontWeight: 620,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 180ms ease",
  },
  tendenciasChipActiveCofersa: {
    background: "#7C3AED",
    color: "#fff",
    borderColor: "#7C3AED",
    boxShadow: "0 4px 12px rgba(124,58,237,0.25)",
  },
  tendenciasChipActiveEpa: {
    background: "#0369A1",
    color: "#fff",
    borderColor: "#0369A1",
    boxShadow: "0 4px 12px rgba(3,105,161,0.25)",
  },

  providerTimesFilterBar: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: 12,
    alignItems: "end",
  },

  providerTimesFilterField: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },

  providerTimesFilterLabel: {
    fontSize: 11,
    fontWeight: 790,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  providerTimesSearchInput: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    fontWeight: 850,
    fontSize: 13,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
  },

  providerTimesSelect: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "10px 12px",
    fontWeight: 850,
    fontSize: 13,
    color: "#0F172A",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  providerTimesFilterHint: {
    fontSize: 12,
    fontWeight: 620,
    color: "#94A3B8",
    lineHeight: 1.35,
  },

  infoHelpSheet: {
    position: "relative",
    zIndex: 1,
    width: "min(720px, calc(100vw - 32px))",
    maxHeight: "min(calc(100vh - 32px), 720px)",
    background: "#fff",
    borderRadius: 18,
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
    fontWeight: 820,
    color: "#0F172A",
    lineHeight: 1.2,
  },
  aperturasSheetSubtitle: {
    marginTop: 4,
    color: "#64748B",
    fontWeight: 620,
    fontSize: 12,
    lineHeight: 1.4,
  },
  aperturasSheetCloseBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
    fontWeight: 790,
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
    fontWeight: 790,
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
    fontWeight: 620,
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
  rangeModalActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  settingsShowUsersBtn: {
    borderRadius: 10,
    border: "1px solid #D8E4FE",
    background: "#EEF4FF",
    color: "#1D4ED8",
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "fit-content",
  },
  settingsError: {
    fontSize: 12,
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 700,
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
    fontWeight: 700,
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
    fontWeight: 620,
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
    fontWeight: 700,
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
    fontWeight: 620,
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
    fontWeight: 700,
    fontSize: 11,
  },
  aperturasFilterInput: {
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 620,
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
    fontWeight: 620,
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
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  aperturasFilterHint: {
    color: "#94A3B8",
    fontWeight: 620,
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
  userTimeRowActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  aperturasRowTitle: {
    fontWeight: 790,
    fontSize: 13,
    color: "#0F172A",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  aperturasRowMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 620,
    color: "#64748B",
    lineHeight: 1.35,
  },
  estadoPill: {
    fontSize: 11,
    fontWeight: 700,
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
    fontWeight: 790,
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