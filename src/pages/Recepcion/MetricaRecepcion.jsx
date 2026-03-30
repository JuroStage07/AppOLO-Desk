import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  Info,
  Loader2,
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

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

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

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDayKeysForFilter(filterKey) {
  const now = new Date();

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
        });
      }

      const row = map.get(key);
      row.acciones += Number(a?.accionesDia || 0);
      row.finalizadas += Number(a?.finalizadasDia || 0);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.acciones - a.acciones);
}

function buildDashboardFromDailyDocs(filterKey, docs = []) {
  const labelMap = {
    hoy: "Hoy",
    semana: "Semana actual",
    mes: "Mes actual",
    rango: "Rango personalizado",
  };

  const heroBadgeMap = {
    hoy: "Tiempo real",
    semana: "Semanal",
    mes: "Mensual",
    rango: "Personalizado",
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

  const { alerts } = buildAlertsFromDocs({
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

  return {
    label: labelMap[filterKey] || "Semana actual",
    heroBadge: heroBadgeMap[filterKey] || "Semanal",
    compliance,
    accionesCreadas,
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
        label: "Aperturas creadas",
        value: fmtInt(accionesCreadas),
        hint: "Acciones de descarga dadas de alta en el período",
        comparison: "Ver listado y estado",
        tone: "default",
      },
    ],
    barData: buildBarData(filterKey, docs),
    lineData: buildLineData(filterKey, docs),
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

function FilterTabs({ active, onChange }) {
  const filters = [
    { key: "hoy", label: "Hoy", hint: "Corte diario" },
    { key: "semana", label: "Semana", hint: "Vista semanal" },
    { key: "mes", label: "Mes", hint: "Vista mensual" },
    { key: "rango", label: "Rango personalizado", hint: "Últimos cortes" },
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
        <button type="button" style={ui.exportBtn} title="Exportar reporte">
          <span style={ui.btnInlineIcon}>
            <TrendingUp size={16} strokeWidth={2.2} />
            Exportar reporte
          </span>
        </button>
      </div>
    </div>
  );
}

function MiniBarChart({ data = [], periodLabel = "Semana actual" }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Descargas por período</div>
          <div style={ui.chartSubtitle}>
            Cantidad de acciones completadas · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Operación</span>
      </div>

      <div style={ui.barChartWrap}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin datos para graficar.</div>
        ) : (
          data.map((item) => (
            <div key={item.label} style={ui.barItem}>
              <div
                style={{
                  ...ui.bar,
                  height: `${Math.max((item.value / max) * 118, 10)}px`,
                }}
                title={`${item.label}: ${item.value}`}
              />
              <div style={ui.barValue}>{item.value}</div>
              <div style={ui.barLabel}>{item.label}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MiniLineChart({ data = [], periodLabel = "Últimos cortes" }) {
  const width = 100;
  const height = 36;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);

  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const normalized = (d.value - min) / Math.max(max - min, 1);
      const y = height - normalized * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Cumplimiento de tiempo objetivo</div>
          <div style={ui.chartSubtitle}>
            Porcentaje de descargas dentro del tiempo esperado · {periodLabel}
          </div>
        </div>
        <span style={ui.chartBadge}>Seguimiento</span>
      </div>

      <div style={ui.lineChartWrap}>
        {data.length === 0 ? (
          <div style={ui.emptyMiniText}>Sin tendencia disponible.</div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={ui.lineSvg}>
            <polyline
              fill="none"
              stroke="rgba(8,159,138,0.12)"
              strokeWidth="5.5"
              points={points}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              fill="none"
              stroke={ACCENT}
              strokeWidth="2.25"
              points={points}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

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

  return (
    <div style={ui.chartCard}>
      <div style={ui.chartHeader}>
        <div>
          <div style={ui.chartTitle}>Mix de operación</div>
          <div style={ui.chartSubtitle}>
            Distribución de descargas por tipo · {periodLabel}
          </div>
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
                  {item.value} · {item.percent}%
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

function AndenesChart({ data = [], periodLabel = "" }) {
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
                <div style={ui.mixValue}>
                  {item.acciones} acc · {item.finalizadas} fin
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
  const [activeFilter, setActiveFilter] = useState("hoy");
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [noDataMessage, setNoDataMessage] = useState("");
  const [aperturasModalOpen, setAperturasModalOpen] = useState(false);
  const [aperturasModalLoading, setAperturasModalLoading] = useState(false);
  const [aperturasModalItems, setAperturasModalItems] = useState([]);
  const [aperturasModalError, setAperturasModalError] = useState("");

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

        if (!tenantId || !company) {
          if (!mounted) return;
          setDashboardData(null);
          setLoadingData(false);
          setLoadError("El perfil no tiene tenantId o company.");
          return;
        }

        const dayKeys = buildDayKeysForFilter(activeFilter);

        const q = query(
          collection(db, "dashboard_salud_daily"),
          where("tenantId", "==", tenantId),
          where("company", "==", company),
          orderBy("dayKey", "asc")
        );

        const snap = await getDocs(q);

        const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filteredDocs = allDocs.filter((d) => dayKeys.includes(d.dayKey));

        const built = buildDashboardFromDailyDocs(activeFilter, filteredDocs);

        if (!filteredDocs.length) {
          const msg =
            activeFilter === "hoy"
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
  }, [activeFilter]);

  useEffect(() => {
    if (!aperturasModalOpen) return;
    let cancelled = false;
    (async () => {
      setAperturasModalLoading(true);
      setAperturasModalError("");
      try {
        const dayKeys = buildDayKeysForFilter(activeFilter);
        const allowed = new Set(dayKeys);
        const q = query(
          collection(db, "accion_descarga"),
          orderBy("creadoAt", "desc"),
          limit(1500)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  }, [aperturasModalOpen, activeFilter]);

  return (
    <div style={ui.shell}>
      <style>{`
        @keyframes metricaRecepcionSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
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

          <div style={ui.topbarRight}>
            <div style={ui.userBox}>
              <div style={ui.userAvatar}>
                <User size={16} strokeWidth={2.2} />
              </div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
                <div style={ui.userMail}>{user?.email || "—"}</div>
              </div>
            </div>

            <button type="button" onClick={() => nav("/recepcion")} style={ui.btnGhost}>
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Volver a recepción
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
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
          <div style={ui.hero}>
            <div style={ui.heroMain}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Analítica operativa</div>
                <span style={{ ...ui.badge, ...ui.badgeInline }}>
                  <BarChart3 size={12} strokeWidth={2.5} style={{ marginRight: 5, flexShrink: 0 }} />
                  {currentData.heroBadge}
                </span>
              </div>

              <h1 style={ui.title}>Panel de Recepción</h1>

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
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Control</div>
            <div style={ui.sectionTitle}>Filtros de visualización</div>
            <div style={ui.sectionText}>
              Selecciona el período de análisis para actualizar los indicadores y las gráficas del panel.
            </div>
          </div>

          <div style={ui.stickyFiltersOnly}>
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

              <FilterTabs active={activeFilter} onChange={setActiveFilter} />
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Resumen</div>
            <div style={ui.sectionTitle}>Indicadores clave</div>
            <div style={ui.sectionText}>
              Vista rápida del desempeño operativo, el volumen procesado y la capacidad utilizada en el período activo.
            </div>
          </div>

          <div style={ui.stickyKpisOnly}>
            <div style={ui.kpiPanel}>
              <div style={ui.kpiPanelTop}>
                <div style={ui.kpiPanelInfo}>
                  <div style={ui.kpiPanelTitle}>Resumen ejecutivo</div>
                  <div style={ui.kpiPanelText}>
                    Métricas principales para evaluar ritmo operativo, cumplimiento y uso de capacidad.
                  </div>
                </div>

                <div style={ui.kpiPanelMeta}>
                  Corte activo: <b>{currentData.label}</b>
                </div>
              </div>

              <div style={ui.kpiGrid}>
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
            <div style={ui.sectionTitle}>Alertas y estado operativo</div>
            <div style={ui.sectionText}>
              Señales rápidas para detectar desvíos, pendientes y estado general del flujo operativo.
            </div>
          </div>

          <div style={ui.alertsGrid}>
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

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Analítica</div>
            <div style={ui.sectionTitle}>Visualización general</div>
            <div style={ui.sectionText}>
              Gráficas para revisar volumen, tendencia de cumplimiento y desempeño operativo del período.
            </div>
          </div>

          <div style={ui.chartGrid}>
            <MiniBarChart data={currentData.barData} periodLabel={currentData.label} />
            <MiniLineChart data={currentData.lineData} periodLabel={currentData.label} />
            <MixTypeChart data={currentData.typeMix} periodLabel={currentData.label} />
            <AndenesChart data={currentData.andenesData} periodLabel={currentData.label} />
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionOverline}>Equipo</div>
            <div style={ui.sectionTitle}>Desempeño del equipo</div>
            <div style={ui.sectionText}>
              Comparativo de productividad y tiempos promedio por operador para el período seleccionado.
            </div>
          </div>

          <div style={ui.teamGrid}>
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
              <div>
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
              <div style={ui.aperturasList}>
                {aperturasModalItems.map((row) => {
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
    position: "relative",
    zIndex: 90,
    background: "#F6F7FB",
    paddingTop: 2,
    paddingBottom: 10,
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

  barChartWrap: {
    height: 160,
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 6px 0",
    marginTop: 4,
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
    height: "96px",
    overflow: "visible",
  },

  lineLegend: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
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

  aperturasModalRoot: {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    display: "grid",
    placeItems: "end center",
  },
  aperturasModalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.35)",
    border: "none",
    cursor: "pointer",
  },
  aperturasSheet: {
    position: "relative",
    width: "min(640px, 100%)",
    maxHeight: "min(78vh, 640px)",
    background: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    border: "1px solid #E7E9F2",
    boxShadow: "0 -18px 60px rgba(15,23,42,0.22)",
    padding: 16,
    margin: 12,
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 12,
    zIndex: 1,
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
  aperturasList: {
    overflow: "auto",
    maxHeight: "min(52vh, 420px)",
    display: "grid",
    gap: 8,
    paddingRight: 4,
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
};