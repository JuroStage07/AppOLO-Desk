import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase"; // Asegúrate de tener la conexión a Firestore configurada correctamente.
import {
    collection,
    doc,
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

function buildDayKeysForFilter(filterKey) {
    // Utiliza la misma lógica que tenías en el primer código para crear las claves del día.
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
    // Agrega el resto de las condiciones según tu lógica anterior.
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

                const builtDashboard = buildDashboardFromDocs(filteredDocs);
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

    // Transformar los datos en el formato que utilizas para mostrar KPIs
    const buildDashboardFromDocs = (docs) => {
        const totalVisados = docs.reduce((acc, doc) => acc + (doc.visadosActivos || 0), 0);
        const totalIngresos = docs.reduce((acc, doc) => acc + (doc.ingresos || 0), 0);
        const totalEquipos = docs.reduce((acc, doc) => acc + (doc.equiposRevisados || 0), 0);

        const compliance = Math.round((totalIngresos / totalVisados) * 100);

        return {
            label: "Semana actual", // O el nombre basado en `activeFilter`
            compliance,
            kpis: [
                {
                    label: "Visados activos",
                    value: totalVisados.toString(),
                    hint: "Visados válidos y no vencidos",
                    comparison: `${totalIngresos} ingresados`,
                },
                {
                    label: "Ingresos",
                    value: totalIngresos.toString(),
                    hint: "Ingresos por terceros",
                    comparison: `${totalVisados} visados activos`,
                },
                {
                    label: "Equipos revisados",
                    value: totalEquipos.toString(),
                    hint: "Revisiones realizadas",
                    comparison: `${totalIngresos} ingresos`,
                },
                {
                    label: "Cumplimiento operativo",
                    value: `${compliance}%`,
                    hint: "Tasa de cumplimiento en ingresos",
                    comparison: "Total de visados",
                },
            ],
        };
    };

    // Datos actuales para visualización (utilizando datos ya procesados)
    const currentData = useMemo(() => dashboardData || { kpis: [] }, [dashboardData]);

    return (
        <div style={ui.shell}>
            <div style={ui.topbar}>
                <div
                    style={ui.brand}
                    role="button"
                    tabIndex={0}
                    onClick={() => nav("/salud")}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/salud")}
                >
                    <div style={ui.brandMark}>SO</div>
                    <div style={{ display: "grid", gap: 2 }}>
                        <div style={ui.brandTitle}>Salud Ocupacional</div>
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

                    <button type="button" onClick={() => nav("/salud")} style={ui.btnGhost}>
                        ← Volver a módulos
                    </button>
                </div>
            </div>

            <div style={ui.main}>
                <div style={ui.container}>
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

    stickyFiltersOnly: {
        position: "sticky",
        top: 2,
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
        top: 220,
        zIndex: 70,
        background: "#F6F7FB",
        paddingBottom: 10,
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

    stickyChartsOnly: {
        position: "sticky",
        top: 228,
        zIndex: 70,
        background: "#F6F7FB",
        paddingBottom: 10,
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

    kpiHint: {
        color: ACCENT,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1.3,
    },
};