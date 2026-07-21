// pages/Recepcion/MetricasRecepcion.jsx
// Métricas de las "acciones de recepción" (colección `accion_recepcion`).
// Cada acción se genera al finalizar una "acción de descarga" y luego se
// inicia/completa desde la app de recepción. Esta página agrega KPIs y
// desgloses (por tipo, andén, proveedor y usuario) acotados por tenant+company.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
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
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  PlayCircle,
  Timer,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { filterByUserScope } from "../../utils/dataScope";
import ColumnFilter from "../MRP/components/ColumnFilter";
import {
  Brand,
  ErrorState,
  GhostButton,
  KpiCard,
  KpiGrid,
  Spinner,
  TableScroll,
  Topbar,
} from "../../components/ui";
import {
  ACCENT,
  BORDER,
  SLATE,
  TEXT,
  SURFACE,
  RADIUS_2XL,
  SHADOW_CARD,
} from "../../styles/theme";

const MAX_DOCS = 4000;
const PAGE_SIZE = 8;

// Mismo set de "Período de análisis" que Reportes de Descarga.
const PERIOD_TABS = [
  { key: "hoy", label: "Hoy", hint: "Corte diario" },
  { key: "semana", label: "Semana", hint: "Vista semanal" },
  { key: "mes", label: "Mes", hint: "Vista mensual" },
  { key: "rango", label: "Rango personalizado", hint: "Desde / hasta" },
];

/* ───────────────────────── helpers ───────────────────────── */

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s) {
  if (!s || !String(s).trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(dt.getTime()) ? null : dt;
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

function defaultRangeDates() {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 6);
  return { desde: ymd(desde), hasta: ymd(hasta) };
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

/** Devuelve el rango [from, to] (Date) para el período activo. */
function periodRange(period, customRange) {
  const now = new Date();
  if (period === "hoy") {
    return { from: startOfDayDate(now), to: endOfDayDate(now) };
  }
  if (period === "semana") {
    const start = startOfWeekMonday(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: start, to: endOfDayDate(end) };
  }
  if (period === "mes") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: startOfDayDate(start), to: endOfDayDate(end) };
  }
  if (period === "rango") {
    const desde = startOfDayDate(parseYMD(customRange?.desde));
    const hasta = endOfDayDate(parseYMD(customRange?.hasta));
    return { from: desde, to: hasta };
  }
  return { from: null, to: null };
}

function periodActiveLabel(period, customRange) {
  if (period === "hoy") return "Hoy";
  if (period === "semana") return "Semana actual";
  if (period === "mes") return "Mes actual";
  if (period === "rango") return formatRangeLabel(customRange);
  return "—";
}

function fmtInt(n) {
  return new Intl.NumberFormat("es-CR").format(Number(n || 0));
}

function fmtDuration(ms) {
  const n = Number(ms || 0);
  if (!n || n < 0) return "—";
  const totalMin = Math.round(n / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtDateTime(ts) {
  const d = toDateSafe(ts);
  if (!d) return "—";
  return d.toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Estado de una acción de recepción según su ciclo de vida. */
function getEstado(item) {
  if (item?.completedAt) return "Completa";
  if (item?.startedAt) return "En proceso";
  return "Creada";
}

function starterIdentity(row) {
  const uid = String(row?.starterUid ?? row?.creadoPorUid ?? "sin_uid").trim();
  const label = String(
    row?.starter ?? row?.creadoPorNombre ?? uid ?? "Usuario"
  ).trim();
  return { uid: uid || "sin_uid", label: label || "Usuario" };
}

function andenLabel(row) {
  const a = row?.idAnden;
  return a === null || a === undefined || a === "" ? "—" : String(a);
}

// Columnas de la tabla con filtro estilo Excel. `get` produce el valor usado
// tanto para armar las opciones del filtro como para comparar al filtrar.
const TABLE_COLUMNS = [
  { key: "accion", label: "Acción", get: (r) => String(r?.nombreAccion || "—") },
  { key: "tipo", label: "Tipo", get: (r) => String(r?.tipo || "—") },
  { key: "anden", label: "Andén", get: andenLabel },
  {
    key: "proveedor",
    label: "Proveedor",
    get: (r) => String(r?.proveedorNombre || "—"),
  },
  { key: "usuario", label: "Usuario", get: (r) => starterIdentity(r).label },
  { key: "estado", label: "Estado", get: getEstado },
];

/**
 * Dibuja un gráfico de barras horizontales en un canvas y devuelve un PNG
 * (dataURL). Se usa para incrustar "gráficos" en el Excel, ya que ExcelJS no
 * puede generar gráficos nativos.
 */
function barChartToPng(title, data, { width = 540 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  const rowH = 28;
  const padTop = 46;
  const padBottom = 18;
  const labelW = 160;
  const valueW = 46;
  const barAreaW = width - labelW - valueW - 24;
  const height = padTop + padBottom + Math.max(1, rows.length) * rowH;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 16px Arial";
  ctx.fillText(title, 14, 28);

  if (rows.length === 0) {
    ctx.fillStyle = "#64748B";
    ctx.font = "13px Arial";
    ctx.fillText("Sin datos.", 14, padTop + 8);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  }

  const max = rows.reduce((m, d) => Math.max(m, Number(d.value) || 0), 0) || 1;

  rows.forEach((d, i) => {
    const y = padTop + i * rowH;

    // Etiqueta (truncada si es muy larga).
    ctx.fillStyle = "#334155";
    ctx.font = "12px Arial";
    let label = String(d.name ?? "");
    while (label.length > 3 && ctx.measureText(label).width > labelW - 12) {
      label = label.slice(0, -2);
    }
    if (label !== String(d.name ?? "")) label += "…";
    ctx.fillText(label, 14, y + 18);

    // Barra.
    const bw = Math.max(2, (Number(d.value || 0) / max) * barAreaW);
    ctx.fillStyle = "#089F8A";
    ctx.beginPath();
    ctx.roundRect(labelW, y + 6, bw, 15, [0, 4, 4, 0]);
    ctx.fill();

    // Valor.
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 12px Arial";
    ctx.fillText(String(d.value ?? ""), labelW + bw + 6, y + 18);
  });

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

/** Agrupa filas por una clave y cuenta ocurrencias, ordenado desc. */
function topBreakdown(rows, keyFn, labelFn, topN = 8) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const prev = map.get(key) || { count: 0, label: labelFn(row, key) };
    prev.count += 1;
    map.set(key, prev);
  }
  const list = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((x) => ({ name: x.label, value: x.count }));
  return list.slice(0, topN);
}

/* ───────────────────────── component ───────────────────────── */

export default function MetricasRecepcion() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [period, setPeriod] = useState("hoy");
  const [customRange, setCustomRange] = useState(() => defaultRangeDates());
  const [customRangeDraft, setCustomRangeDraft] = useState(() =>
    defaultRangeDates()
  );
  const [customRangeModalOpen, setCustomRangeModalOpen] = useState(false);
  const [customRangeError, setCustomRangeError] = useState("");
  const [page, setPage] = useState(0);
  // Filtros por columna (estilo Excel). null = sin filtro; array = valores permitidos.
  const [colFilters, setColFilters] = useState({});

  const handleFilterChange = (nextKey) => {
    if (nextKey === "rango") {
      setCustomRangeDraft(customRange);
      setCustomRangeError("");
      setCustomRangeModalOpen(true);
      return;
    }
    setPeriod(nextKey);
  };

  const applyCustomRange = () => {
    const desde = parseYMD(customRangeDraft.desde);
    const hasta = parseYMD(customRangeDraft.hasta);
    if (!desde || !hasta) {
      setCustomRangeError("Seleccioná una fecha desde y una fecha hasta válidas.");
      return;
    }
    const normalized =
      desde <= hasta
        ? { desde: ymd(desde), hasta: ymd(hasta) }
        : { desde: ymd(hasta), hasta: ymd(desde) };
    setCustomRange(normalized);
    setPeriod("rango");
    setCustomRangeModalOpen(false);
    setCustomRangeError("");
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
          if (!mounted) return;
          setError("No hay usuario autenticado.");
          setLoading(false);
          return;
        }

        const profileSnap = await getDoc(doc(db, "profiles", currentUser.uid));
        const profile = profileSnap.exists() ? profileSnap.data() || {} : {};
        const tenantId = String(profile?.tenantId || "").trim();
        const company = String(profile?.company || "").trim();
        const bodegaId = String(profile?.bodegaId || "").trim();

        if (!tenantId || !company) {
          if (!mounted) return;
          setError("El perfil no tiene tenantId o company.");
          setLoading(false);
          return;
        }

        const qy = query(
          collection(db, "accion_recepcion"),
          where("tenantId", "==", tenantId),
          where("company", "==", company),
          orderBy("creadoAt", "desc"),
          limit(MAX_DOCS)
        );
        const snap = await getDocs(qy);
        const scoped = filterByUserScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          tenantId,
          company,
          bodegaId
        );

        if (!mounted) return;
        setRows(scoped);
        setLoading(false);
      } catch (err) {
        console.error("MetricasRecepcion load:", err);
        if (!mounted) return;
        setError("No se pudieron cargar las acciones de recepción.");
        setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Filtra por período usando `creadoAt` (fecha de generación de la acción).
  const filtered = useMemo(() => {
    const { from, to } = periodRange(period, customRange);
    const fromMs = from ? from.getTime() : null;
    const toMs = to ? to.getTime() : null;
    return rows.filter((r) => {
      const d = toDateSafe(r?.creadoAt);
      if (!d) return false;
      const t = d.getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    });
  }, [rows, period, customRange]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    let creadas = 0;
    let enProceso = 0;
    let completas = 0;
    let sumMs = 0;
    let sumCount = 0;

    for (const row of filtered) {
      const estado = getEstado(row);
      if (estado === "Completa") completas += 1;
      else if (estado === "En proceso") enProceso += 1;
      else creadas += 1;

      const ms = Number(row?.totalTimeMs || 0);
      if (row?.completedAt && ms > 0) {
        sumMs += ms;
        sumCount += 1;
      }
    }

    const avgMs = sumCount > 0 ? sumMs / sumCount : 0;

    const porTipo = topBreakdown(
      filtered,
      (r) => String(r?.tipo || "").trim() || "Sin tipo",
      (_r, k) => k
    );
    const porAnden = topBreakdown(
      filtered,
      (r) => {
        const a = r?.idAnden;
        return a === null || a === undefined || a === ""
          ? "Sin andén"
          : `Andén ${a}`;
      },
      (_r, k) => k
    );
    const porProveedor = topBreakdown(
      filtered,
      (r) => String(r?.proveedorNombre || "").trim() || "Sin proveedor",
      (_r, k) => k
    );
    const porUsuario = topBreakdown(
      filtered,
      (r) => starterIdentity(r).uid,
      (r) => starterIdentity(r).label
    );

    return {
      total,
      creadas,
      enProceso,
      completas,
      avgMs,
      porTipo,
      porAnden,
      porProveedor,
      porUsuario,
    };
  }, [filtered]);

  // Opciones de cada filtro de columna, derivadas del set del período (no de
  // los filtros de columna) para que siempre se puedan volver a seleccionar.
  const colOptions = useMemo(() => {
    const out = {};
    for (const col of TABLE_COLUMNS) {
      const seen = new Map();
      for (const r of filtered) {
        const v = col.get(r);
        if (!seen.has(v)) seen.set(v, { value: v, label: v });
      }
      out[col.key] = [...seen.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "es", { numeric: true })
      );
    }
    return out;
  }, [filtered]);

  // Aplica los filtros de columna sobre el set del período (solo afecta la tabla).
  const tableRows = useMemo(() => {
    return filtered.filter((r) =>
      TABLE_COLUMNS.every((col) => {
        const sel = colFilters[col.key];
        if (!Array.isArray(sel)) return true;
        return sel.includes(col.get(r));
      })
    );
  }, [filtered, colFilters]);

  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));

  // Reinicia la paginación cuando cambia el período, el rango, los datos o los filtros.
  useEffect(() => {
    setPage(0);
  }, [period, customRange, rows, colFilters]);

  // Ajusta la página si queda fuera de rango tras filtrar.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const recientes = useMemo(
    () => tableRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [tableRows, page]
  );

  const handleExportExcel = async () => {
    if (!tableRows.length) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Recepción");
      ws.columns = [
        { header: "Acción", key: "accion", width: 28 },
        { header: "Tipo", key: "tipo", width: 16 },
        { header: "Andén", key: "anden", width: 10 },
        { header: "Proveedor", key: "proveedor", width: 26 },
        { header: "Usuario", key: "usuario", width: 22 },
        { header: "Estado", key: "estado", width: 14 },
        { header: "Duración", key: "duracion", width: 14 },
        { header: "Creada", key: "creada", width: 20 },
        { header: "Iniciada", key: "iniciada", width: 20 },
        { header: "Completada", key: "completada", width: 20 },
      ];
      tableRows.forEach((r) => {
        ws.addRow({
          accion: r.nombreAccion || "",
          tipo: r.tipo || "",
          anden: r.idAnden ?? "",
          proveedor: r.proveedorNombre || "",
          usuario: starterIdentity(r).label,
          estado: getEstado(r),
          duracion: fmtDuration(r.totalTimeMs),
          creada: fmtDateTime(r.creadoAt),
          iniciada: fmtDateTime(r.startedAt),
          completada: fmtDateTime(r.completedAt),
        });
      });
      ws.getRow(1).font = { bold: true };

      // === Hoja "Gráficos" — desgloses de las filas exportadas (filtradas). ===
      // Se calculan sobre `tableRows` para que coincidan con lo exportado.
      const charts = [
        {
          title: "Por tipo",
          data: topBreakdown(
            tableRows,
            (r) => String(r?.tipo || "").trim() || "Sin tipo",
            (_r, k) => k
          ),
        },
        {
          title: "Por andén",
          data: topBreakdown(
            tableRows,
            (r) => (andenLabel(r) === "—" ? "Sin andén" : `Andén ${andenLabel(r)}`),
            (_r, k) => k
          ),
        },
        {
          title: "Por proveedor",
          data: topBreakdown(
            tableRows,
            (r) => String(r?.proveedorNombre || "").trim() || "Sin proveedor",
            (_r, k) => k
          ),
        },
        {
          title: "Por usuario",
          data: topBreakdown(
            tableRows,
            (r) => starterIdentity(r).uid,
            (r) => starterIdentity(r).label
          ),
        },
      ];

      const wsG = wb.addWorksheet("Gráficos");
      wsG.getColumn(1).width = 4;
      let anchorRow = 1;
      for (const chart of charts) {
        const png = barChartToPng(chart.title, chart.data);
        const imageId = wb.addImage({ base64: png.dataUrl, extension: "png" });
        wsG.addImage(imageId, {
          tl: { col: 1, row: anchorRow },
          ext: { width: png.width, height: png.height },
        });
        // Deja espacio para la siguiente imagen (filas de ~20px).
        anchorRow += Math.ceil(png.height / 20) + 2;
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reportes-recepcion_${period}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("MetricasRecepcion export excel:", err);
    }
  };

  return (
    <div style={styles.shell}>
      <style>{`
        @keyframes metricasRecepcionSpin { to { transform: rotate(360deg); } }
      `}</style>

      <Topbar>
        <Brand
          icon={BarChart3}
          title="Recepción"
          subtitle="Reportes de Recepción"
          onClick={() => nav("/recepcion")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/recepcion")}>
            Recepción
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <main style={styles.main}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Acciones de recepción</h1>
            <p style={styles.sub}>
              Generadas al finalizar una acción de descarga. Se acota por bodega,
              tenant y compañía.
            </p>
          </div>
        </div>

        <section style={styles.periodCard}>
          <div style={styles.periodHead}>
            <div>
              <div style={styles.periodTitle}>Período de análisis</div>
              <div style={styles.periodSubtitle}>
                Cambia la vista para revisar el comportamiento operativo por día,
                semana o mes.
              </div>
            </div>
            <div style={styles.periodHeadRight}>
              <div style={styles.periodActive}>
                Vista activa: <b>{periodActiveLabel(period, customRange)}</b>
              </div>
              <button
                type="button"
                style={{
                  ...styles.excelBtn,
                  ...(loading || !tableRows.length
                    ? { opacity: 0.5, cursor: "not-allowed" }
                    : {}),
                }}
                onClick={handleExportExcel}
                disabled={loading || !tableRows.length}
                title="Descargar acciones de recepción en Excel"
              >
                <FileSpreadsheet size={16} strokeWidth={2.2} />
                Excel
              </button>
            </div>
          </div>

          <div style={styles.filtersWrap}>
            {PERIOD_TABS.map((tab) => {
              const selected = period === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleFilterChange(tab.key)}
                  style={{
                    ...styles.filterBtn,
                    ...(selected ? styles.filterBtnActive : {}),
                  }}
                >
                  <span style={styles.filterBtnLabel}>{tab.label}</span>
                  <span
                    style={{
                      ...styles.filterBtnHint,
                      ...(selected ? styles.filterBtnHintActive : {}),
                    }}
                  >
                    {tab.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {loading ? (
          <div style={styles.centerBox}>
            <Spinner />
            <span style={styles.centerText}>
              <Loader2
                size={16}
                strokeWidth={2.2}
                style={{ animation: "metricasRecepcionSpin 0.7s linear infinite" }}
              />
              Cargando métricas…
            </span>
          </div>
        ) : error ? (
          <ErrorState title="No se pudo cargar" description={error} />
        ) : (
          <>
            <KpiGrid style={{ marginBottom: 20 }}>
              <KpiCard
                accent
                label="Total acciones"
                value={fmtInt(metrics.total)}
                hint="En el período seleccionado"
                icon={PackageCheck}
              />
              <KpiCard
                label="Creadas"
                value={fmtInt(metrics.creadas)}
                hint="Pendientes de iniciar"
                icon={Clock}
              />
              <KpiCard
                label="En proceso"
                value={fmtInt(metrics.enProceso)}
                hint="Iniciadas sin completar"
                icon={PlayCircle}
              />
              <KpiCard
                label="Completas"
                value={fmtInt(metrics.completas)}
                hint="Finalizadas"
                icon={CheckCircle2}
              />
              <KpiCard
                label="Tiempo promedio"
                value={fmtDuration(metrics.avgMs)}
                hint="Sobre acciones completas"
                icon={Timer}
              />
            </KpiGrid>

            <div style={styles.chartsGrid}>
              <ChartCard title="Por tipo" data={metrics.porTipo} />
              <ChartCard title="Por andén" data={metrics.porAnden} />
              <ChartCard
                title="Por proveedor"
                data={metrics.porProveedor}
                tickFontSize={11}
                labelWidth={150}
              />
              <ChartCard title="Por usuario" data={metrics.porUsuario} />
            </div>

            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Detalles de Recepción</h2>
              {filtered.length === 0 ? (
                <p style={styles.empty}>
                  No hay acciones de recepción para este período.
                </p>
              ) : (
                <>
                  <TableScroll>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {TABLE_COLUMNS.map((col) => (
                            <th key={col.key} style={styles.th}>
                              <span style={styles.thInner}>
                                <span>{col.label}</span>
                                <ColumnFilter
                                  options={colOptions[col.key] || []}
                                  selected={colFilters[col.key] ?? null}
                                  onChange={(next) =>
                                    setColFilters((prev) => ({
                                      ...prev,
                                      [col.key]: next,
                                    }))
                                  }
                                />
                              </span>
                            </th>
                          ))}
                          <th style={styles.th}>Duración</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.length === 0 ? (
                          <tr>
                            <td
                              style={styles.tdEmpty}
                              colSpan={TABLE_COLUMNS.length + 1}
                            >
                              Sin resultados para los filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {recientes.map((r) => (
                              <tr key={r.id}>
                                <td style={styles.td}>
                                  {r.nombreAccion || "—"}
                                </td>
                                <td style={styles.td}>{r.tipo || "—"}</td>
                                <td style={styles.td}>{andenLabel(r)}</td>
                                <td style={styles.td}>
                                  {r.proveedorNombre || "—"}
                                </td>
                                <td style={styles.td}>
                                  {starterIdentity(r).label}
                                </td>
                                <td style={styles.td}>
                                  <EstadoPill estado={getEstado(r)} />
                                </td>
                                <td style={styles.td}>
                                  {fmtDuration(r.totalTimeMs)}
                                </td>
                              </tr>
                            ))}
                            {Array.from({
                              length: PAGE_SIZE - recientes.length,
                            }).map((_, i) => (
                              <tr key={`filler-${i}`} aria-hidden="true">
                                {Array.from({
                                  length: TABLE_COLUMNS.length + 1,
                                }).map((__, j) => (
                                  <td key={j} style={styles.tdFiller}>
                                    &nbsp;
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </TableScroll>

                  {tableRows.length > 0 && (
                    <div style={styles.pagination}>
                      <span style={styles.paginationInfo}>
                        Mostrando {page * PAGE_SIZE + 1}–
                        {Math.min((page + 1) * PAGE_SIZE, tableRows.length)} de{" "}
                        {fmtInt(tableRows.length)}
                      </span>
                      <div style={styles.paginationBtns}>
                        <button
                          type="button"
                          style={{
                            ...styles.pageBtn,
                            ...(page === 0
                              ? { opacity: 0.45, cursor: "not-allowed" }
                              : {}),
                          }}
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0}
                          aria-label="Página anterior"
                        >
                          <ChevronLeft size={16} strokeWidth={2.2} />
                        </button>
                        <span style={styles.pageLabel}>
                          {page + 1} / {pageCount}
                        </span>
                        <button
                          type="button"
                          style={{
                            ...styles.pageBtn,
                            ...(page >= pageCount - 1
                              ? { opacity: 0.45, cursor: "not-allowed" }
                              : {}),
                          }}
                          onClick={() =>
                            setPage((p) => Math.min(pageCount - 1, p + 1))
                          }
                          disabled={page >= pageCount - 1}
                          aria-label="Página siguiente"
                        >
                          <ChevronRight size={16} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>

      {customRangeModalOpen && (
        <div
          style={styles.modalRoot}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recepcion-range-modal-title"
        >
          <button
            type="button"
            style={styles.modalBackdrop}
            onClick={() => setCustomRangeModalOpen(false)}
            aria-label="Cerrar"
          />
          <div style={styles.modalSheet}>
            <div style={styles.modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div id="recepcion-range-modal-title" style={styles.modalTitle}>
                  Rango personalizado
                </div>
                <div style={styles.modalSubtitle}>
                  Seleccioná fecha desde y hasta para recalcular las métricas.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomRangeModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                Cerrar
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.rangeRow}>
                <label style={styles.rangeField}>
                  <span style={styles.rangeLabel}>Desde</span>
                  <input
                    type="date"
                    value={customRangeDraft.desde}
                    onChange={(e) =>
                      setCustomRangeDraft((prev) => ({
                        ...prev,
                        desde: e.target.value,
                      }))
                    }
                    style={styles.rangeInput}
                  />
                </label>
                <label style={styles.rangeField}>
                  <span style={styles.rangeLabel}>Hasta</span>
                  <input
                    type="date"
                    value={customRangeDraft.hasta}
                    onChange={(e) =>
                      setCustomRangeDraft((prev) => ({
                        ...prev,
                        hasta: e.target.value,
                      }))
                    }
                    style={styles.rangeInput}
                  />
                </label>
              </div>

              {customRangeError ? (
                <div style={styles.rangeError}>{customRangeError}</div>
              ) : (
                <div style={styles.rangeHint}>
                  El rango activo será: <b>{formatRangeLabel(customRangeDraft)}</b>
                </div>
              )}

              <div style={styles.rangeActions}>
                <button
                  type="button"
                  style={styles.rangeGhostBtn}
                  onClick={() => setCustomRangeDraft(defaultRangeDates())}
                >
                  Últimos 7 días
                </button>
                <button
                  type="button"
                  style={styles.rangeApplyBtn}
                  onClick={applyCustomRange}
                >
                  Aplicar rango
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── subcomponents ───────────────────────── */

// Tick del eje Y en una sola línea: trunca con "…" para que las etiquetas
// largas no se envuelvan ni se solapen entre barras. El nombre completo queda
// disponible al pasar el mouse (<title>).
function AxisTick({ x, y, payload, fontSize = 11, maxWidth = 120 }) {
  const text = String(payload?.value ?? "");
  const maxChars = Math.max(6, Math.floor((maxWidth - 8) / (fontSize * 0.6)));
  const shown =
    text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={fontSize}
      fill={TEXT}
    >
      {shown}
      <title>{text}</title>
    </text>
  );
}

function ChartCard({ title, data, tickFontSize = 11, labelWidth = 120 }) {
  const hasData = Array.isArray(data) && data.length > 0;
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      {!hasData ? (
        <p style={styles.empty}>Sin datos.</p>
      ) : (
        <div style={{ width: "100%", height: Math.max(180, data.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid horizontal={false} stroke={BORDER} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
              <YAxis
                type="category"
                dataKey="name"
                width={labelWidth}
                interval={0}
                tick={<AxisTick fontSize={tickFontSize} maxWidth={labelWidth} />}
              />
              <Tooltip
                formatter={(v) => [fmtInt(v), "Acciones"]}
                contentStyle={{ borderRadius: 12, border: `1px solid ${BORDER}` }}
              />
              <Bar dataKey="value" fill={ACCENT} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function EstadoPill({ estado }) {
  const tone =
    estado === "Completa"
      ? { bg: "#EAF7EE", fg: "#166534", bd: "#C6EAD2" }
      : estado === "En proceso"
      ? { bg: "#FFF4DF", fg: "#92400E", bd: "#FFE1A8" }
      : { bg: "#EEF2F7", fg: SLATE, bd: BORDER };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.bd}`,
      }}
    >
      {estado}
    </span>
  );
}

/* ───────────────────────── styles ───────────────────────── */

const styles = {
  shell: { minHeight: "100vh", background: "#F6F7FB" },
  main: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: "20px 24px 48px",
  },
  headerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  h1: { margin: 0, fontSize: 24, fontWeight: 950, color: TEXT },
  sub: { margin: "4px 0 0", fontSize: 13, fontWeight: 600, color: SLATE, maxWidth: 560 },

  periodCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_2XL,
    boxShadow: SHADOW_CARD,
    padding: 16,
    marginBottom: 20,
    display: "grid",
    gap: 14,
  },
  periodHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  periodTitle: { fontSize: 15, fontWeight: 900, color: TEXT },
  periodSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: 600,
    color: SLATE,
    maxWidth: 520,
    lineHeight: 1.35,
  },
  periodHeadRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  periodActive: {
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    whiteSpace: "nowrap",
  },
  excelBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid #C6EAD2",
    background: "#EAF7EE",
    color: "#166534",
    borderRadius: 12,
    padding: "9px 14px",
    fontWeight: 850,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  filtersWrap: {
    display: "flex",
    alignItems: "stretch",
    gap: 10,
    flexWrap: "wrap",
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
    fontFamily: "inherit",
  },
  filterBtnActive: {
    background: "#F1FBF8",
    color: ACCENT,
    border: "1px solid rgba(8,159,138,0.35)",
    boxShadow: "0 10px 24px rgba(8,159,138,0.10)",
    transform: "translateY(-1px)",
  },
  filterBtnLabel: { fontWeight: 790, fontSize: 12, lineHeight: 1.1 },
  filterBtnHint: { fontWeight: 620, fontSize: 11, color: SLATE, lineHeight: 1.1 },
  filterBtnHintActive: { color: ACCENT },

  centerBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "64px 0",
  },
  centerText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: SLATE,
    fontWeight: 700,
    fontSize: 13,
  },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  card: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_2XL,
    boxShadow: SHADOW_CARD,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: TEXT },
  empty: { margin: 0, color: SLATE, fontWeight: 600, fontSize: 13, padding: "12px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    color: SLATE,
    fontWeight: 900,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },
  thInner: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  tdEmpty: {
    padding: "18px 12px",
    color: SLATE,
    fontWeight: 700,
    fontSize: 13,
    textAlign: "center",
  },
  tdFiller: {
    padding: "10px 12px",
    borderBottom: `1px solid ${BORDER}`,
    color: "transparent",
  },
  td: {
    padding: "10px 12px",
    color: TEXT,
    fontWeight: 600,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },

  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  paginationInfo: { fontSize: 12, fontWeight: 700, color: SLATE },
  paginationBtns: { display: "flex", alignItems: "center", gap: 8 },
  pageBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    color: TEXT,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pageLabel: { fontSize: 12, fontWeight: 800, color: TEXT, minWidth: 54, textAlign: "center" },

  /* Custom range modal */
  modalRoot: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  modalBackdrop: {
    position: "absolute",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    border: "none",
    cursor: "pointer",
  },
  modalSheet: {
    position: "relative",
    width: "min(520px, 100%)",
    background: SURFACE,
    borderRadius: RADIUS_2XL,
    boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
    border: `1px solid ${BORDER}`,
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px",
    borderBottom: `1px solid ${BORDER}`,
  },
  modalTitle: { fontSize: 16, fontWeight: 900, color: TEXT },
  modalSubtitle: { marginTop: 2, fontSize: 12, fontWeight: 600, color: SLATE },
  modalCloseBtn: {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    borderRadius: 10,
    padding: "6px 12px",
    fontWeight: 800,
    fontSize: 12,
    color: TEXT,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  modalBody: { padding: 18, display: "grid", gap: 14 },
  rangeRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  rangeField: { display: "grid", gap: 6, flex: 1, minWidth: 160 },
  rangeLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rangeInput: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #D7DCE5",
    background: "#fff",
    padding: "0 12px",
    fontSize: 14,
    color: TEXT,
    outline: "none",
    fontFamily: "inherit",
  },
  rangeHint: { fontSize: 13, fontWeight: 600, color: SLATE },
  rangeError: { fontSize: 13, fontWeight: 700, color: "#B91C1C" },
  rangeActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  rangeGhostBtn: {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    borderRadius: 12,
    padding: "10px 16px",
    fontWeight: 800,
    fontSize: 13,
    color: TEXT,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  rangeApplyBtn: {
    border: "1px solid rgba(8,159,138,0.35)",
    background: ACCENT,
    borderRadius: 12,
    padding: "10px 18px",
    fontWeight: 850,
    fontSize: 13,
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
