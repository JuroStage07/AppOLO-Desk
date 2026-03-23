import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";

const ACCENT = "#089F8A";

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
  const tiempoTotalMs = sum(docs, (d) => d.accionesTiempoTotalMs);
  const aperturasCreadas = sum(docs, (d) => d.aperturasCreadas);

  const tiempoPromedioMs =
    accionesFinalizadas > 0 ? Math.round(tiempoTotalMs / accionesFinalizadas) : 0;

  const usuariosActivos = countActiveUsers(docs);
  const andenesEnUso = countAndenesInUse(docs);
  const topUsers = groupStarters(docs);

  const latestOpen = docs.length
    ? Number(docs[docs.length - 1]?.aperturasAbiertasFinDia || 0)
    : 0;

  const compliance =
    accionesIniciadas > 0 ? Math.round((accionesFinalizadas / accionesIniciadas) * 100) : 0;

  return {
    label: labelMap[filterKey] || "Semana actual",
    heroBadge: heroBadgeMap[filterKey] || "Semanal",
    compliance,
    kpis: [
      {
        label: "Descargas completadas",
        value: String(accionesFinalizadas),
        hint: "Acciones cerradas en el período",
        comparison: `${accionesIniciadas} iniciadas`,
      },
      {
        label: "Tiempo promedio",
        value: fmtMinutesFromMs(tiempoPromedioMs),
        hint: "Promedio desde inicio hasta cierre",
        comparison: `${accionesFinalizadas} finalizadas`,
      },
      {
        label: "Usuarios activos",
        value: String(usuariosActivos),
        hint: "Operadores con actividad registrada",
        comparison: `${topUsers.length} en ranking`,
      },
      {
        label: "Andenes en uso",
        value: `${andenesEnUso}/7`,
        hint: "Andenes con actividad registrada",
        comparison: `${latestOpen} aperturas abiertas`,
      },
    ],
    barData: buildBarData(filterKey, docs),
    lineData: buildLineData(filterKey, docs),
    userData: topUsers,
    notes: [
      `Aperturas creadas en el período: ${aperturasCreadas}.`,
      `Cumplimiento operativo actual: ${compliance}%.`,
      `Tiempo promedio de descarga: ${fmtMinutesFromMs(tiempoPromedioMs)}.`,
    ],
  };
}

function FilterTabs({ active, onChange }) {
  const filters = [
    { key: "hoy", label: "Hoy" },
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mes" },
    { key: "rango", label: "Rango personalizado" },
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
              {filter.label}
            </button>
          );
        })}
      </div>

      <button type="button" style={ui.exportBtn} title="Exportar reporte">
        <span style={ui.exportIcon}>📈</span>
        Exportar reporte
      </button>
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

export default function MetricaRecepcion() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [activeFilter, setActiveFilter] = useState("hoy");
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [noDataMessage, setNoDataMessage] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prev;
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
        kpis: [
          {
            label: "Descargas completadas",
            value: "0",
            hint: "Acciones cerradas en el período",
            comparison: "—",
          },
          {
            label: "Tiempo promedio",
            value: "0 min",
            hint: "Promedio desde inicio hasta cierre",
            comparison: "—",
          },
          {
            label: "Usuarios activos",
            value: "0",
            hint: "Operadores con actividad registrada",
            comparison: "—",
          },
          {
            label: "Andenes en uso",
            value: "0/7",
            hint: "Andenes con actividad registrada",
            comparison: "—",
          },
        ],
        barData: [],
        lineData: [],
        userData: [],
        notes: loadError ? [loadError] : ["Sin información disponible para el período."],
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

  return (
    <div style={ui.shell}>
      <div style={ui.topbar}>
        <div
          style={ui.brand}
          role="button"
          tabIndex={0}
          onClick={() => nav("/recepcion")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/recepcion")}
        >
          <div style={ui.brandMark}>RC</div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>Recepción</div>
            <div style={ui.brandSub}>Panel de métricas</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <div style={ui.userBox}>
            <div style={ui.userAvatar}>
              {(user?.displayName || user?.email || "U")[0]?.toUpperCase?.()}
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
              <div style={ui.userMail}>{user?.email || "—"}</div>
            </div>
          </div>

          <button type="button" onClick={() => nav("/recepcion")} style={ui.btnGhost}>
            ← Volver a recepción
          </button>
        </div>
      </div>

      <div style={ui.main}>
        <div style={ui.container}>
          {loadingData && (
            <div style={ui.infoBanner}>
              Cargando métricas...
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
            <div style={{ display: "grid", gap: 10 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Analítica</div>
                <span style={ui.badge}>{currentData.heroBadge}</span>
              </div>

              <h1 style={ui.title}>Estadísticas de Recepción</h1>
              <p style={ui.subtitle}>
                Panel ejecutivo para monitorear descargas, tiempos operativos,
                ocupación de andenes y desempeño de usuarios. Esta base queda
                lista para conectarse con datos reales de acciones de descarga.
              </p>
            </div>

            <div style={ui.heroNote}>
              <div style={ui.heroNoteTitle}>Corte seleccionado</div>
              <div style={ui.heroNoteText}>
                Mostrando indicadores para: <b>{currentData.label}</b>.
              </div>

              <div style={ui.heroMiniList}>
                <div style={ui.heroMiniItem}>
                  <span style={ui.heroMiniDot} />
                  Descargas = acciones completadas
                </div>
                <div style={ui.heroMiniItem}>
                  <span style={ui.heroMiniDot} />
                  Tiempo promedio = inicio a cierre
                </div>
                <div style={ui.heroMiniItem}>
                  <span style={ui.heroMiniDot} />
                  Usuarios activos = operadores con actividad
                </div>
                <div style={ui.heroMiniItem}>
                  <span style={ui.heroMiniDot} />
                  Andenes en uso = ocupación operativa
                </div>
              </div>
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionTitle}>Filtros de visualización</div>
            <div style={ui.sectionText}>
              Cambiá el período para revisar el comportamiento operativo.
            </div>
          </div>

          <div style={ui.stickyFiltersOnly}>
            <FilterTabs active={activeFilter} onChange={setActiveFilter} />
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionTitle}>Indicadores clave</div>
            <div style={ui.sectionText}>
              Resumen general de recepción según el período seleccionado.
            </div>
          </div>

          <div style={ui.stickyKpisOnly}>
            <div style={ui.kpiGrid}>
              {currentData.kpis.map((item) => (
                <div key={item.label} style={ui.kpiCard}>
                  <div style={ui.kpiLabel}>{item.label}</div>
                  <div style={ui.kpiValue}>{item.value}</div>
                  <div style={ui.kpiMeta}>{item.hint}</div>
                  <div style={ui.kpiHint}>{item.comparison}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={ui.sectionHeaderBlock}>
            <div style={ui.sectionTitle}>Visualización general</div>
            <div style={ui.sectionText}>
              Gráficas para seguimiento de volumen, cumplimiento de tiempo y
              productividad del equipo.
            </div>
          </div>

          <div style={ui.chartGrid}>
            <MiniBarChart data={currentData.barData} periodLabel={currentData.label} />
            <MiniLineChart data={currentData.lineData} periodLabel={currentData.label} />
            <DonutPlaceholder
              value={currentData.compliance}
              label="Cumplimiento operativo"
              subtitle="Descargas dentro del tiempo objetivo"
            />
            <MiniUserChart data={currentData.userData} periodLabel={currentData.label} />
          </div>

          <div style={ui.bottomCard}>
            <div style={ui.bottomTitle}>Observación</div>
            <div style={ui.bottomText}>
              Esta pantalla ya deja definida la estructura visual para conectar
              con Firestore y calcular métricas reales como promedio de
              <b> totalTimeTxt</b>, acciones por usuario, ocupación por
              <b> idAnden</b>, estados de proceso y cumplimiento por fecha. En
              la siguiente etapa podés reemplazar el mock por consultas reales
              desde <b>accion_descarga</b>.
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
      </div>
    </div>
  );
}

const ui = {
  shell: {
    height: "100vh",
    width: "100vw",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    height: 64,
    minHeight: 64,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,247,251,0.98) 100%)",
    backdropFilter: "blur(10px)",
    position: "relative",
    zIndex: 100,
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 12px 24px rgba(8,159,138,0.20)",
  },
  brandTitle: { fontWeight: 950, fontSize: 14 },
  brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },

  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },

  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
  },

  main: {
    overflow: "auto",
    padding: "0 16px 16px",
    display: "grid",
    placeItems: "start center",
  },

  container: {
    width: "min(1220px, 100%)",
    display: "grid",
    gap: 10,
    paddingBottom: 18,
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "1.45fr 1fr",
    gap: 14,
    alignItems: "stretch",
    paddingTop: 14,
  },

  kickerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 4px rgba(8,159,138,0.14)",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  subtitle: {
    margin: 0,
    color: "#64748B",
    fontWeight: 800,
    lineHeight: 1.45,
    maxWidth: 780,
  },

  heroNote: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    alignContent: "start",
    gap: 10,
  },
  heroNoteTitle: {
    fontWeight: 980,
    marginBottom: 2,
    color: "#0F172A",
  },
  heroNoteText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.4,
  },

  heroMiniList: {
    display: "grid",
    gap: 8,
    marginTop: 4,
  },
  heroMiniItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
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
    position: "sticky",
    top: 0,
    zIndex: 90,
    background: "#F6F7FB",
    paddingTop: 0,
    paddingBottom: 8,
  },

  stickyKpisOnly: {
    position: "sticky",
    top: 62,
    zIndex: 80,
    background: "#F6F7FB",
    paddingBottom: 8,
  },

  filtersBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  filtersWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "0",
    background: "#F6F7FB",
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
  },

  filterBtn: {
    border: "1px solid #DDE3EE",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
    transition: "all 120ms ease",
  },
  filterBtnActive: {
    background: "#F1FBF8",
    color: ACCENT,
    border: "1px solid rgba(8,159,138,0.35)",
    boxShadow: "0 10px 24px rgba(8,159,138,0.10)",
  },

  exportBtn: {
    border: "1px solid rgba(8,159,138,0.24)",
    background: "#F1FBF8",
    color: ACCENT,
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 950,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 8px 18px rgba(8,159,138,0.08)",
    whiteSpace: "nowrap",
  },

  exportIcon: {
    fontSize: 14,
    lineHeight: 1,
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    padding: "0",
  },

  kpiCard: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
    minHeight: 104,
    display: "grid",
    alignContent: "start",
  },
  kpiLabel: {
    color: "#64748B",
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 8,
  },
  kpiValue: {
    color: "#0F172A",
    fontWeight: 980,
    fontSize: 28,
    lineHeight: 1.1,
    marginBottom: 8,
  },
  kpiMeta: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.3,
    marginBottom: 8,
  },
  kpiHint: {
    color: ACCENT,
    fontWeight: 900,
    fontSize: 12,
    lineHeight: 1.3,
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    alignItems: "stretch",
  },

  chartCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
    minHeight: 270,
    display: "grid",
    alignContent: "start",
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
    background: "#FFFFFF",
    padding: 16,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  bottomTitle: {
    fontWeight: 980,
    color: "#0F172A",
    marginBottom: 6,
  },
  bottomText: {
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.5,
  },

  noteList: {
    display: "grid",
    gap: 8,
    marginTop: 14,
  },

  noteItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
  },

  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    flexShrink: 0,
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    minWidth: 0,
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    fontWeight: 980,
    flexShrink: 0,
  },
  userName: {
    fontWeight: 980,
    fontSize: 12,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  userMail: {
    fontWeight: 850,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.1,
  },

  infoBanner: {
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    color: "#64748B",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 800,
    fontSize: 13,
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
};