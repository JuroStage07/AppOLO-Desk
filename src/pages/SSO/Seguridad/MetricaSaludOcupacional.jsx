import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, TrendingUp } from "lucide-react";
import {
    Brand,
    Container,
    GhostButton,
    Main,
    Shell,
    Topbar,
} from "../../../components/ui";
import { auth, db } from "../../../firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
} from "firebase/firestore";

const ACCENT = "#089F8A";

// Helper functions para formatear los datos como en el ejemplo anterior
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

function startOfWeekMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function buildDayKeysForFilter(filterKey) {
    const now = new Date();
    if (filterKey === "hoy") return [ymd(now)];
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
        for (let d = 1; d <= last; d++) {
            out.push(ymd(new Date(y, m, d)));
        }
        return out;
    }
    if (filterKey === "rango") {
        const out = [];
        for (let i = 13; i >= 0; i--) {
            const dt = new Date(now);
            dt.setDate(dt.getDate() - i);
            out.push(ymd(dt));
        }
        return out;
    }
    return [];
}

function ymd(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export default function MetricaSaludOcupacional() {
    const nav = useNavigate();
    const user = auth.currentUser;
    const [activeFilter, setActiveFilter] = useState("hoy");
    const [dashboardData, setDashboardData] = useState(null);
    const [loadingData, setLoadingData] = useState(true);
    const [loadError, setLoadError] = useState("");

    // Obtener datos desde Firestore
    useEffect(() => {
        const loadDashboardData = async () => {
            try {
                setLoadingData(true);
                setLoadError("");

                if (!user?.uid) {
                    setLoadError("No hay usuario autenticado.");
                    setLoadingData(false);
                    return;
                }

                const profileSnap = await getDoc(doc(db, "profiles", user.uid));
                const profile = profileSnap.exists() ? profileSnap.data() : null;

                const tenantId = profile?.tenantId;
                const company = profile?.company;

                if (!tenantId || !company) {
                    setLoadError("El perfil no tiene tenantId o company.");
                    setLoadingData(false);
                    return;
                }

                const dayKeys = buildDayKeysForFilter(activeFilter);

                // Consulta de Firestore
                const q = query(
                    collection(db, "dashboard_salud_daily"),
                    where("tenantId", "==", tenantId),
                    where("company", "==", company),
                    orderBy("dayKey", "asc")
                );

                const snap = await getDocs(q);
                const allDocs = snap.docs.map((doc) => doc.data());
                const filteredDocs = allDocs.filter((doc) => dayKeys.includes(doc.dayKey));

                if (filteredDocs.length === 0) {
                    setLoadError("No hay datos para el período seleccionado.");
                }

                const builtDashboard = buildDashboardFromDocs(filteredDocs, activeFilter);
                setDashboardData(builtDashboard);
                setLoadingData(false);
            } catch (error) {
                console.error("Error al cargar los datos del dashboard", error);
                setLoadError("No se pudieron cargar los datos.");
                setLoadingData(false);
            }
        };

        loadDashboardData();
    }, [activeFilter, user]);

    const currentData = useMemo(
        () =>
            dashboardData || {
                kpis: [],
                label: "—",
                heroBadge: "Salud",
                compliance: 0,
                barData: [],
                lineData: [],
            },
        [dashboardData]
    );

    return (
        <Shell>
            <Topbar>
                <Brand
                    icon={BarChart3}
                    title="Salud Ocupacional"
                    subtitle="Panel de métricas"
                    onClick={() => nav("/seguridad")}
                />
                <Topbar.Right>
                    <GhostButton icon={ArrowLeft} onClick={() => nav("/seguridad")}>
                        Menú Salud
                    </GhostButton>
                </Topbar.Right>
            </Topbar>

            <Main center>
                <Container style={ui.container}>
                    <div style={ui.hero}>
                        <div style={{ display: "grid", gap: 10 }}>
                            <div style={ui.kickerRow}>
                                <span style={ui.kickerDot} />
                                <div style={ui.kicker}>Analítica</div>
                                <span style={ui.badge}>{currentData.heroBadge}</span>
                            </div>

                            <h1 style={ui.title}>Estadísticas</h1>
                            <p style={ui.subtitle}>
                                Panel ejecutivo con métricas preliminares de Salud Ocupacional.
                                Esta vista deja definidos los indicadores clave y la estructura para integrar datos reales.
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
                                    Ingresos = terceros registrados
                                </div>
                                <div style={ui.heroMiniItem}>
                                    <span style={ui.heroMiniDot} />
                                    Visados activos = vigentes no vencidos
                                </div>
                                <div style={ui.heroMiniItem}>
                                    <span style={ui.heroMiniDot} />
                                    Equipos revisados = checklists cerrados
                                </div>
                                <div style={ui.heroMiniItem}>
                                    <span style={ui.heroMiniDot} />
                                    Aperturas = creadas en el período
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={ui.sectionHeaderBlock}>
                        <div style={ui.sectionTitle}>Filtros de visualización</div>
                        <div style={ui.sectionText}>
                            Cambiá el período para actualizar la vista preliminar.
                        </div>
                    </div>

                    <div style={ui.stickyFiltersOnly}>
                        <FilterTabs active={activeFilter} onChange={setActiveFilter} />
                    </div>

                    <div style={ui.sectionHeaderBlock}>
                        <div style={ui.sectionTitle}>Indicadores clave</div>
                        <div style={ui.sectionText}>
                            Resumen operativo del área según el filtro seleccionado.
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
                            Gráficas preliminares para presentar comportamiento, tendencia y nivel de cumplimiento documental.
                        </div>
                    </div>

                    <div style={ui.stickyChartsOnly}>
                        <div style={ui.chartGrid}>
                            <MiniBarChart data={currentData.barData} periodLabel={currentData.label} />
                            <MiniLineChart data={currentData.lineData} periodLabel={currentData.label} />
                            <DonutPlaceholder
                                value={currentData.compliance}
                                label="Cumplimiento documental"
                                subtitle="Nivel estimado actual"
                            />
                        </div>
                    </div>

                    {/*<div style={ui.bottomCard}>
                        <div style={ui.bottomTitle}>Observación</div>
                        <div style={ui.bottomText}>
                            Esta versión deja separada la configuración mock del componente y consolida una experiencia
                            más cercana a un dashboard corporativo. En la siguiente etapa se puede conectar con aperturas,
                            terceros, visados y revisión de equipos para mostrar datos reales y filtros funcionales por fecha.
                        </div>
                    </div>*/}
                </Container>
            </Main>
        </Shell>
    );
}

const ui = {
    container: {
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
    filtersActions: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
    },
    emptyMiniText: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 13,
        textAlign: "center",
        padding: "24px 8px",
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
    kpiHint: {
        color: ACCENT,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1.35,
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

    chartGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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

    stickyChartsOnly: {
        position: "sticky",
        top: 228,
        zIndex: 70,
        background: "#F6F7FB",
        paddingBottom: 10,
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

    kpiMeta: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 12,
        lineHeight: 1.3,
        marginBottom: 8,
    },
};

function FilterTabs({ active, onChange }) {
    const filters = [
        { key: "hoy", label: "Hoy", hint: "Corte diario" },
        { key: "semana", label: "Semana", hint: "Vista semanal" },
        { key: "mes", label: "Mes", hint: "Vista mensual" },
        { key: "rango", label: "Rango personalizado", hint: "Últimos 14 días" },
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
                    <div style={ui.chartTitle}>Ingresos por día</div>
                    <div style={ui.chartSubtitle}>Terceros registrados · {periodLabel}</div>
                </div>
                <span style={ui.chartBadge}>Salud</span>
            </div>

            <div style={ui.barChartWrap}>
                {data.length === 0 ? (
                    <div style={ui.emptyMiniText}>Sin datos para graficar.</div>
                ) : (
                    data.map((item) => (
                        <div key={`${item.label}-${item.value}`} style={ui.barItem}>
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
                    <div style={ui.chartTitle}>Cumplimiento diario</div>
                    <div style={ui.chartSubtitle}>
                        Ingresos respecto a visados activos · {periodLabel}
                    </div>
                </div>
                <span style={ui.chartBadge}>Tendencia</span>
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
                    <div key={`${d.label}-${d.value}`} style={ui.legendItem}>
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
    value = 0,
    label = "Cumplimiento documental",
    subtitle = "Nivel estimado actual",
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
