// PanelEquiposMantenimiento.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../firebase";

// 👇 Ajustá rutas reales de tus imágenes
import ApiladorPng from "../../assets/equipos/apilador_icon.png";
import CarretillaPng from "../../assets/equipos/carretilla_icon.png";
import MontacargasPng from "../../assets/equipos/montacargas_icon.png";

const ACCENT = "#089F8A";

function safe(v) {
    return String(v ?? "").trim();
}

function getEquipoIcon(familia) {
    const f = safe(familia).toLowerCase();
    if (f.includes("apilador")) return ApiladorPng;
    if (f.includes("montacargas")) return MontacargasPng;
    if (f.includes("carretilla")) return CarretillaPng;
    return CarretillaPng;
}

export default function PanelEquiposMantenimiento() {
    const nav = useNavigate();

    const [equipos, setEquipos] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showFilters, setShowFilters] = useState(false);
    const [familiaActiva, setFamiliaActiva] = useState("Todas");
    const [revisionFiltro, setRevisionFiltro] = useState("Todas"); // Todas | Pendientes | Al día
    const [estadoFiltro, setEstadoFiltro] = useState("Todos"); // Todos | Activo | Inactivo | Mantenimiento

    useEffect(() => {
        const qRef = query(collection(db, "equipos"));

        const unsub = onSnapshot(
            qRef,
            (snap) => {
                const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setEquipos(rows);
                setLoading(false);
            },
            (err) => {
                console.error("PanelEquiposMantenimiento onSnapshot error:", err);
                setLoading(false);
            }
        );

        return () => unsub();
    }, []);

    const familias = useMemo(() => {
        const set = new Set();

        // (Opcional) que el selector de familias se adapte al filtro de estado
        const base = (equipos || []).filter((e) => {
            if (estadoFiltro === "Todos") return true;
            const est = safe(e.estado).toLowerCase();
            if (estadoFiltro === "Mantenimiento") return est.includes("mantenimiento");
            return est === estadoFiltro.toLowerCase();
        });

        base.forEach((e) => {
            if (safe(e.familia)) set.add(e.familia);
        });

        return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    }, [equipos, estadoFiltro]);

    const equiposFiltrados = useMemo(() => {
        const list = (equipos || [])
            // ✅ filtro por estado
            .filter((e) => {
                if (estadoFiltro === "Todos") return true;
                const est = safe(e.estado).toLowerCase();
                if (estadoFiltro === "Mantenimiento") return est.includes("mantenimiento");
                return est === estadoFiltro.toLowerCase();
            })
            // ✅ filtro por revisión diaria (checklistD === false => pendiente)
            .filter((e) => {
                const pendiente = e.checklistD === false;
                if (revisionFiltro === "Todas") return true;
                if (revisionFiltro === "Pendientes") return pendiente;
                if (revisionFiltro === "Al día") return !pendiente;
                return true;
            })
            // ✅ filtro por familia
            .filter((e) => {
                if (familiaActiva === "Todas") return true;
                return e.familia === familiaActiva;
            });

        // ✅ ORDEN: primero fallaActiva, luego por checklistD_lastAt (desc)
        return list.sort((a, b) => {
            const aFalla = a.fallaActiva === true;
            const bFalla = b.fallaActiva === true;
            if (aFalla !== bFalla) return aFalla ? -1 : 1;

            const aMs = a.checklistD_lastAt?.toDate?.()?.getTime?.() ?? 0;
            const bMs = b.checklistD_lastAt?.toDate?.()?.getTime?.() ?? 0;
            return bMs - aMs;
        });
    }, [equipos, estadoFiltro, revisionFiltro, familiaActiva]);

    const pendientesEnVista = useMemo(
        () => equiposFiltrados.filter((e) => e.checklistD === false).length,
        [equiposFiltrados]
    );
    const alDiaEnVista = useMemo(
        () => equiposFiltrados.filter((e) => e.checklistD !== false).length,
        [equiposFiltrados]
    );

    return (
        <div style={ui.shell}>
            {/* Topbar */}
            <div style={ui.topbar}>
                <div style={ui.brand} onClick={() => nav("/mantenimiento")}>
                    <div style={{ display: "grid", gap: 2 }}>
                        <div style={ui.brandTitle}>Mantenimiento</div>
                        <div style={ui.brandSub}>Panel · Equipos</div>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={ui.kpi}>
                        <div style={ui.kpiLabel}>Mostrando</div>
                        <div style={ui.kpiValue}>{equiposFiltrados.length}</div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        style={ui.btnGhost}
                    >
                        {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                    </button>

                    <button type="button" onClick={() => nav(-1)} style={ui.btnGhost}>
                        ← Volver
                    </button>
                </div>
            </div>

            <div style={ui.main}>
                <div style={ui.container}>
                    {/* Header card */}
                    <div style={ui.headerCard}>
                        <div style={ui.kickerRow}>
                            <span style={ui.kickerDot} />
                            <div style={ui.kicker}>Centro de control</div>
                            <span style={ui.badge}>{loading ? "Cargando…" : "Listo"}</span>
                        </div>

                        <h1 style={ui.title}>Equipos</h1>
                        <p style={ui.subtitle}>
                            Se priorizan equipos con <b>falla</b> y se resaltan con ícono de alerta.
                        </p>

                        <div style={ui.summaryChip}>
                            <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                {equiposFiltrados.length}
                            </span>
                            <span style={{ color: "#64748B", fontWeight: 800 }}>
                                (Pendientes:{" "}
                                <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                    {pendientesEnVista}
                                </span>{" "}
                                · Al día:{" "}
                                <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                    {alDiaEnVista}
                                </span>
                                )
                            </span>
                        </div>
                    </div>

                    {/* Filters */}
                    {showFilters && (
                        <div style={ui.filtersCard}>
                            <div style={ui.filtersGrid}>
                                <div style={ui.field}>
                                    <div style={ui.label}>Revisión diaria</div>
                                    <div style={ui.chipsRow}>
                                        {["Todas", "Pendientes", "Al día"].map((opt) => {
                                            const active = opt === revisionFiltro;
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => setRevisionFiltro(opt)}
                                                    style={{ ...ui.chipBtn, ...(active ? ui.chipBtnActive : {}) }}
                                                >
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={ui.field}>
                                    <div style={ui.label}>Estado</div>
                                    <div style={ui.chipsRow}>
                                        {["Todos", "Activo", "Inactivo", "Mantenimiento"].map((opt) => {
                                            const active = opt === estadoFiltro;
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => setEstadoFiltro(opt)}
                                                    style={{ ...ui.chipBtn, ...(active ? ui.chipBtnActive : {}) }}
                                                >
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={ui.field}>
                                    <div style={ui.label}>Familia</div>
                                    <div style={ui.chipsRow}>
                                        {familias.map((fam) => {
                                            const active = fam === familiaActiva;
                                            return (
                                                <button
                                                    key={fam}
                                                    type="button"
                                                    onClick={() => setFamiliaActiva(fam)}
                                                    style={{ ...ui.chipBtn, ...(active ? ui.chipBtnActive : {}) }}
                                                    title={fam}
                                                >
                                                    {fam}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Grid */}
                    <div style={ui.grid}>
                        {!loading && equiposFiltrados.length === 0 && (
                            <div style={ui.empty}>
                                No hay equipos para este filtro.
                            </div>
                        )}

                        {equiposFiltrados.map((e) => {
                            const fallaActiva = e.fallaActiva === true;
                            const pendiente = e.checklistD === false;

                            const estadoRaw = safe(e.estado);
                            const estado = estadoRaw.toLowerCase();
                            const isActivo = estado === "activo";
                            const isMantenimiento = estado.includes("mantenimiento");

                            const estadoPillStyle = isActivo
                                ? ui.pillOk
                                : isMantenimiento
                                    ? ui.pillWarn
                                    : ui.pillBad;

                            const estadoPillText = estadoRaw || "Sin estado";

                            return (
                                <button
                                    key={e.id}
                                    type="button"
                                    style={ui.card}
                                    onClick={() => nav(`/mantenimiento/equipos/${e.id}`)}
                                >
                                    {fallaActiva && (
                                        <div style={ui.warnBadge}>
                                            <span style={ui.warnIcon}>⚠</span>
                                            <span style={ui.warnTxt}>Falla</span>
                                        </div>
                                    )}

                                    <div style={ui.iconCircle}>
                                        <img
                                            src={getEquipoIcon(e.familia)}
                                            alt="equipo"
                                            style={ui.iconImg}
                                        />
                                    </div>

                                    <div style={ui.cardTitle} title={safe(e.equipo) || "Equipo"}>
                                        {safe(e.equipo) || "Equipo"}
                                    </div>

                                    <div style={ui.cardCode} title={safe(e.codigo) ? `Código: ${safe(e.codigo)}` : "Código: —"}>
                                        {safe(e.codigo) ? `Código: ${safe(e.codigo)}` : "Código: —"}
                                    </div>

                                    <div style={ui.cardOwner}>
                                        {safe(e.responsable) ? `Resp: ${e.responsable}` : "Resp: -"}
                                    </div>

                                    <div style={ui.cardSub}>{safe(e.familia) || "-"}</div>

                                    <div style={ui.pillsWrap}>
                                        <div style={{ ...ui.pill, ...(pendiente ? ui.pillWarn : ui.pillOk) }}>
                                            {pendiente ? "Pendiente" : "Al día"}
                                        </div>

                                        <div style={{ ...ui.pill, ...estadoPillStyle }}>
                                            {estadoPillText}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

const ui = {
    shell: {
        width: "98.78vw",
        minHeight: "100vh",
        background: "#F6F7FB",
        minHeight: "100vh",
        background: "#F6F7FB",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        color: "#0F172A",
        display: "grid",
        gridTemplateRows: "auto 1fr",
    },

    cardCode: {
        fontWeight: 950,
        color: "#94A3B8",
        fontSize: 12,
        lineHeight: "14px",
    },

    topbar: {
        height: 64,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #E7E9F2",
        background:
            "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,247,251,0.96) 100%)",
        backdropFilter: "blur(6px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        gap: 12,
        flexWrap: "wrap",
    },

    brand: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        userSelect: "none",
        minWidth: 240,
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
        flexShrink: 0,
    },
    brandTitle: { fontWeight: 950, fontSize: 14, lineHeight: "16px" },
    brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B", lineHeight: "14px" },

    kpi: {
        display: "grid",
        gap: 2,
        padding: "8px 12px",
        borderRadius: 14,
        border: "1px solid #E7E9F2",
        background: "#fff",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        minWidth: 140,
    },
    kpiLabel: { fontWeight: 850, fontSize: 12, color: "#64748B" },
    kpiValue: { fontWeight: 950, fontSize: 12, color: "#0F172A", lineHeight: 1.1 },

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
        transition: "transform 120ms ease, box-shadow 120ms ease",
    },

    main: {
        width: "100%",
        padding: 16,
        display: "block",
    },

    container: {
        width: "100%",
        maxWidth: "none",
        margin: "0 auto",
        display: "grid",
        gap: 14,
    },

    headerCard: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    },

    kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
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

    title: { margin: "8px 0 0 0", fontSize: 24, fontWeight: 980, letterSpacing: -0.3 },
    subtitle: { margin: "6px 0 0 0", color: "#64748B", fontWeight: 800, lineHeight: 1.4 },

    summaryChip: {
        marginTop: 12,
        borderRadius: 999,
        border: "1px solid #E7E9F2",
        background: "#FBFCFF",
        padding: "8px 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        width: "fit-content",
    },

    filtersCard: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 20,
        padding: 14,
        boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
    },

    // ✅ filtros en 2 columnas cuando hay espacio
    filtersGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
    },

    field: { display: "grid", gap: 8 },
    label: { fontWeight: 980, fontSize: 13, color: "#0F172A" },

    chipsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    chipBtn: {
        borderRadius: 999,
        border: "1px solid #E7E9F2",
        background: "#F6F7FB",
        padding: "8px 12px",
        cursor: "pointer",
        fontWeight: 950,
        color: "#334155",
        maxWidth: 260,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        transition: "transform 120ms ease, box-shadow 120ms ease, border 120ms ease",
    },
    chipBtnActive: {
        border: `1px solid ${ACCENT}`,
        background: "#F3FBF9",
        color: ACCENT,
        boxShadow: "0 10px 22px rgba(8,159,138,0.12)",
    },

    // ✅ grid responsive sin media queries: 1 / 2 / 3 columnas automático
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
    },

    card: {
        position: "relative",
        textAlign: "left",
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 18,
        padding: 14,
        cursor: "pointer",
        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
        display: "grid",
        gap: 8,
        alignContent: "start",
        minHeight: 0,                 // ✅ quitar altura fija
        transition: "transform 140ms ease, box-shadow 140ms ease, border 140ms ease",
        outline: "none",
    },

    // (opcional) si querés hover/focus sin CSS externo:
    // en el button agregá onMouseEnter/Leave y setState para estilo
    // o dejalo así y luego lo mejoramos con className.

    warnBadge: {
        position: "absolute",
        top: 12,
        right: 12,
        borderRadius: 999,
        border: "1px solid #FFE1B8",
        background: "#FFF4E5",
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
    },
    warnIcon: { fontWeight: 950, color: "#B86B00" },
    warnTxt: { fontWeight: 950, fontSize: 12, color: "#B86B00" },

    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 18,
        background: "#F2F4FB",
        border: "1px solid #E7E9F2",
        display: "grid",
        placeItems: "center",
        marginTop: 2,
    },
    iconImg: { width: 34, height: 34, objectFit: "contain" },

    // ✅ textos más consistentes
    cardTitle: {
        fontWeight: 980,
        color: "#0F172A",
        textAlign: "left",
        fontSize: 15,
        lineHeight: "18px",
        marginTop: 2,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
    },
    cardOwner: {
        fontWeight: 900,
        color: "#64748B",
        fontSize: 12,
        lineHeight: "14px",
    },
    cardSub: {
        fontWeight: 850,
        color: "#64748B",
        fontSize: 12,
        lineHeight: "14px",
    },

    pillsWrap: {
        marginTop: 6,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
    },

    pill: {
        borderRadius: 999,
        border: "1px solid #E7E9F2",
        padding: "6px 10px",
        fontWeight: 950,
        fontSize: 12,
        width: "fit-content",
    },
    pillOk: { background: "#EEFBF1", border: "1px solid #CFEEDD", color: "#1F7A3E" },
    pillWarn: { background: "#FFF4E5", border: "1px solid #FFE1B8", color: "#B86B00" },
    pillBad: { background: "#FFF6F6", border: "1px solid #FFD6D6", color: "#9A1D1D" },

    empty: {
        gridColumn: "1 / -1",
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#fff",
        padding: 14,
        fontWeight: 900,
        color: "#64748B",
    },
};