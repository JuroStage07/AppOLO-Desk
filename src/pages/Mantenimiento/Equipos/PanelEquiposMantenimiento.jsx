// PanelEquiposMantenimiento.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeft,
  Filter,
  LayoutGrid,
  Plus,
  RotateCcw,
} from "lucide-react";
import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { filterEquiposByScope } from "../../../utils/dataScope";
import { Brand, GhostButton, Topbar } from "../../../components/ui";
import { ACCENT, ACCENT_SOFT } from "../../../styles/theme";

// 👇 Ajustá rutas reales de tus imágenes
import ApiladorPng from "../../../assets/equipos/apilador_icon.png";
import CarretillaPng from "../../../assets/equipos/carretilla_icon.png";
import MontacargasPng from "../../../assets/equipos/montacargas_icon.png";

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
    const authCtx = useContext(AuthCtx);
    const profile = authCtx?.profile || {};
    const authLoading = authCtx?.loading;

    const [equipos, setEquipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState("");
    const [fCodigo, setFCodigo] = useState("");
    const [fEquipo, setFEquipo] = useState("");
    const [fFamilia, setFFamilia] = useState("");
    const [fMarca, setFMarca] = useState("n/a");
    const [fPropiedad, setFPropiedad] = useState("Propio");
    const [fResponsable, setFResponsable] = useState("");
    const [fSuplente, setFSuplente] = useState("N/A");
    const [fEstado, setFEstado] = useState("Activo");

    const [showFilters, setShowFilters] = useState(false);
    const [familiaActiva, setFamiliaActiva] = useState("Todas");
    const [revisionFiltro, setRevisionFiltro] = useState("Todas"); // Todas | Pendientes | Al día
    const [estadoFiltro, setEstadoFiltro] = useState("Todos"); // Todos | Activo | Inactivo | Mantenimiento

    useEffect(() => {
        if (authLoading) return;
        const tenantId = safe(profile?.tenantId);
        const company = safe(profile?.company);
        if (!tenantId || !company) {
            setEquipos([]);
            setLoading(false);
            setLoadError("No se pudo determinar tenantId/company del perfil.");
            return;
        }

        // Importante: Firestore falla la query si intenta devolver docs fuera de permiso.
        // Por eso filtramos en servidor por tenantId/company.
        const qRef = query(
            collection(db, "equipos"),
            where("tenantId", "==", tenantId),
            where("company", "==", company)
        );

        setLoadError("");
        const unsub = onSnapshot(
            qRef,
            (snap) => {
                const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setEquipos(rows);
                setLoading(false);
                setLoadError("");
            },
            (err) => {
                console.error("PanelEquiposMantenimiento onSnapshot error:", err);
                setLoadError(
                    "No se pudo cargar el listado. Revisá conexión y permisos en Firestore."
                );
                setLoading(false);
            }
        );

        return () => unsub();
    }, [authLoading, profile?.tenantId, profile?.company]);

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
                const pendiente = e.checklistD !== true;
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
        () => equiposFiltrados.filter((e) => e.checklistD !== true).length,
        [equiposFiltrados]
    );
    const alDiaEnVista = useMemo(
        () => equiposFiltrados.filter((e) => e.checklistD === true).length,
        [equiposFiltrados]
    );

    const hasActiveFilters =
        revisionFiltro !== "Todas" ||
        estadoFiltro !== "Todos" ||
        familiaActiva !== "Todas";

    const resetFilters = () => {
        setRevisionFiltro("Todas");
        setEstadoFiltro("Todos");
        setFamiliaActiva("Todas");
    };

    const openAddEquipo = () => {
        setAddError("");
        setFCodigo("");
        setFEquipo("");
        setFFamilia("");
        setFMarca("n/a");
        setFPropiedad("Propio");
        setFResponsable("");
        setFSuplente("N/A");
        setFEstado("Activo");
        setAddOpen(true);
    };

    const closeAddEquipo = () => {
        if (addSaving) return;
        setAddOpen(false);
    };

    const saveEquipo = async () => {
        const tenantId = safe(profile?.tenantId);
        const company = safe(profile?.company);
        const uid = safe(auth.currentUser?.uid);
        if (!tenantId || !company) {
            setAddError("No se pudo determinar tenantId/company del perfil.");
            return;
        }
        if (!uid) {
            setAddError("No hay usuario autenticado.");
            return;
        }

        const payload = {
            checklistD: false,
            checklistD_fallas: [],
            checklistD_hasFallas: false,
            checklistD_lastAt: null,
            codigo: safe(fCodigo),
            company,
            equipo: safe(fEquipo),
            estado: safe(fEstado) || "Activo",
            fallaActiva: false,
            fallaUpdatedAt: null,
            familia: safe(fFamilia),
            marca: safe(fMarca) || "n/a",
            propiedad: safe(fPropiedad) || "Propio",
            responsable: safe(fResponsable),
            suplente: safe(fSuplente) || "N/A",
            tenantId,
            uid,
            updatedAt: serverTimestamp(),
        };

        if (!payload.codigo || !payload.equipo || !payload.familia) {
            setAddError("Completá al menos Código, Equipo y Familia.");
            return;
        }

        try {
            setAddSaving(true);
            setAddError("");
            await addDoc(collection(db, "equipos"), payload);
            setAddOpen(false);
        } catch (e) {
            console.error("Error creando equipo:", e);
            setAddError("No se pudo guardar el equipo. Revisá permisos en Firestore.");
        } finally {
            setAddSaving(false);
        }
    };

    useEffect(() => {
        const style = document.createElement("style");
        style.setAttribute("data-panel-equipos-spin", "1");
        style.textContent = `
          @keyframes panelEquiposSpin { to { transform: rotate(360deg); } }
          @keyframes panelEquiposPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
          .panel-equipo-card:hover { transform: translateY(-2px); }
          .panel-equipo-card[data-tone="default"]:hover { box-shadow: 0 18px 42px rgba(15,23,42,0.1); border-color: rgba(8,159,138,0.22); }
          .panel-equipo-card[data-tone="red"]:hover { box-shadow: 0 18px 40px rgba(220,38,38,0.12); border-color: rgba(220,38,38,0.4); }
          .panel-equipo-card[data-tone="yellow"]:hover { box-shadow: 0 18px 40px rgba(217,119,6,0.14); border-color: rgba(217,119,6,0.42); }
          .panel-equipo-card[data-tone="default"]:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
          .panel-equipo-card[data-tone="red"]:focus-visible { outline: 2px solid #DC2626; outline-offset: 2px; }
          .panel-equipo-card[data-tone="yellow"]:focus-visible { outline: 2px solid #D97706; outline-offset: 2px; }
        `;
        document.head.appendChild(style);
        return () => style.remove();
    }, []);

    return (
        <div style={ui.shell}>
            <Topbar>
                <Brand
                    icon={LayoutGrid}
                    title="Mantenimiento"
                    subtitle="Panel · Equipos"
                    onClick={() => nav("/mantenimiento")}
                />
                <Topbar.Right>
                    <GhostButton icon={ArrowLeft} onClick={() => nav("/mantenimiento")}>
                        Mantenimiento
                    </GhostButton>
                </Topbar.Right>
            </Topbar>

            <div style={ui.main}>
                <div style={ui.container}>
                    {/* Header card */}
                    <div style={ui.headerCard}>
                        <div style={ui.headerAccent} aria-hidden />
                        <div style={ui.kickerRow}>
                            <span style={ui.kickerDot} />
                            <div style={ui.kicker}>Centro de control</div>
                            <span style={ui.badge}>
                                {loadError
                                    ? "Error"
                                    : loading
                                      ? "Cargando…"
                                      : "Listo"}
                            </span>
                        </div>

                        <h1 style={ui.title}>Equipos</h1>
                        <p style={ui.subtitle}>
                            Las tarjetas con{" "}
                            <AlertTriangle
                                size={14}
                                style={{ verticalAlign: "-2px", display: "inline" }}
                                aria-hidden
                            />{" "}
                            indican <b>falla activa</b>. Tocá una tarjeta para ver el detalle.
                        </p>

                        {loadError ? (
                            <div style={ui.errorBanner} role="alert">
                                {loadError}
                            </div>
                        ) : (
                            <div style={ui.summaryChip}>
                                <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                    {loading ? "—" : equiposFiltrados.length}
                                </span>
                                <span style={{ color: "#64748B", fontWeight: 800 }}>
                                    {" "}
                                    visibles · Pendientes checklist:{" "}
                                    <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                        {loading ? "—" : pendientesEnVista}
                                    </span>
                                    {" · "}
                                    Al día:{" "}
                                    <span style={{ fontWeight: 900, color: "#0F172A" }}>
                                        {loading ? "—" : alDiaEnVista}
                                    </span>
                                </span>
                            </div>
                        )}

                        <div style={ui.headerActions}>
                            <button
                                type="button"
                                onClick={() => setShowFilters((v) => !v)}
                                style={{
                                    ...ui.btnGhost,
                                    ...(showFilters ? ui.btnGhostActive : {}),
                                }}
                                aria-expanded={showFilters}
                            >
                                <Filter size={17} strokeWidth={2} aria-hidden />
                                {showFilters ? "Ocultar filtros" : "Filtros"}
                            </button>

                            <button
                                type="button"
                                onClick={openAddEquipo}
                                style={ui.btnPrimary}
                                disabled={authLoading}
                                title="Agregar equipo"
                            >
                                <Plus size={17} strokeWidth={2} aria-hidden />
                                Agregar equipo
                            </button>

                            {hasActiveFilters ? (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    style={ui.btnGhost}
                                    title="Quitar todos los filtros"
                                >
                                    <RotateCcw size={17} strokeWidth={2} aria-hidden />
                                    Limpiar
                                </button>
                            ) : null}
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
                        {loading &&
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={`sk-${i}`} style={ui.skeletonCard} aria-hidden>
                                    <div style={ui.skeletonIcon} />
                                    <div style={ui.skeletonLine} />
                                    <div style={{ ...ui.skeletonLine, width: "55%" }} />
                                    <div style={{ ...ui.skeletonLine, width: "40%" }} />
                                </div>
                            ))}

                        {!loading &&
                            equipos.length > 0 &&
                            equiposFiltrados.length === 0 && (
                                <div style={ui.empty}>
                                    <div style={ui.emptyTitle}>Ningún equipo coincide</div>
                                    <p style={ui.emptyText}>
                                        Probá otro filtro o restablecé los criterios.
                                    </p>
                                    {hasActiveFilters ? (
                                        <button
                                            type="button"
                                            onClick={resetFilters}
                                            style={ui.emptyBtn}
                                        >
                                            Quitar filtros
                                        </button>
                                    ) : null}
                                </div>
                            )}

                        {!loading && equipos.length === 0 && !loadError && (
                            <div style={ui.empty}>
                                <div style={ui.emptyTitle}>Sin equipos en tu ámbito</div>
                                <p style={ui.emptyText}>
                                    Cuando existan documentos en la colección equipos, aparecerán
                                    aquí.
                                </p>
                            </div>
                        )}

                        {!loading &&
                            equiposFiltrados.map((e) => {
                            const fallaActiva = e.fallaActiva === true;
                            const pendiente = e.checklistD !== true;

                            const estadoRaw = safe(e.estado);
                            const estado = estadoRaw.toLowerCase();
                            const isActivo = estado === "activo";
                            const isMantenimiento = estado.includes("mantenimiento");
                            const isInactivo = estado === "inactivo";

                            /** Rojo: falla o inactivo. Amarillo: mantenimiento (si no aplica rojo). */
                            const cardTone =
                                fallaActiva || isInactivo
                                    ? "red"
                                    : isMantenimiento
                                      ? "yellow"
                                      : "default";

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
                                    className="panel-equipo-card"
                                    data-tone={cardTone}
                                    style={{
                                        ...ui.card,
                                        ...(cardTone === "red"
                                            ? ui.cardBgRed
                                            : cardTone === "yellow"
                                              ? ui.cardBgYellow
                                              : {}),
                                    }}
                                    onClick={() => nav(`/mantenimiento/equipos/${e.id}`)}
                                    aria-label={`Abrir ${safe(e.equipo) || "equipo"}, código ${safe(e.codigo) || "sin código"}`}
                                >
                                    {fallaActiva && (
                                        <div
                                            style={{
                                                ...ui.warnBadge,
                                                ...(cardTone === "red"
                                                    ? ui.warnBadgeOnRed
                                                    : {}),
                                            }}
                                        >
                                            <AlertTriangle
                                                size={14}
                                                strokeWidth={2.5}
                                                color={
                                                    cardTone === "red"
                                                        ? "#B91C1C"
                                                        : "#B86B00"
                                                }
                                                aria-hidden
                                            />
                                            <span
                                                style={{
                                                    ...ui.warnTxt,
                                                    ...(cardTone === "red"
                                                        ? { color: "#991B1B" }
                                                        : {}),
                                                }}
                                            >
                                                Falla
                                            </span>
                                        </div>
                                    )}

                                    <div
                                        style={{
                                            ...ui.iconCircle,
                                            ...(cardTone === "red"
                                                ? ui.iconCircleOnRed
                                                : cardTone === "yellow"
                                                  ? ui.iconCircleOnYellow
                                                  : {}),
                                        }}
                                    >
                                        <img
                                            src={getEquipoIcon(e.familia)}
                                            alt=""
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

            {addOpen && (
                <div style={modal.backdrop} onClick={closeAddEquipo} role="dialog" aria-modal="true">
                    <div style={modal.sheet} onClick={(e) => e.stopPropagation()}>
                        <div style={modal.header}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={modal.icon} aria-hidden="true">
                                    <Plus size={18} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <div style={modal.title}>Agregar equipo</div>
                                    <div style={modal.sub}>
                                        Se guardará en <b>equipos</b> con tu ámbito:{" "}
                                        <b>{safe(profile?.tenantId) || "—"}</b> ·{" "}
                                        <b>{safe(profile?.company) || "—"}</b>
                                    </div>
                                </div>
                            </div>
                            <button type="button" style={modal.close} onClick={closeAddEquipo} disabled={addSaving}>
                                ✕
                            </button>
                        </div>

                        <div style={modal.body}>
                            {addError ? <div style={modal.error}>{addError}</div> : null}

                            <div style={modal.grid}>
                                <div style={modal.field}>
                                    <div style={modal.label}>Código *</div>
                                    <input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} style={modal.input} placeholder="Ej: M3" />
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Equipo *</div>
                                    <input value={fEquipo} onChange={(e) => setFEquipo(e.target.value)} style={modal.input} placeholder="Ej: Montacargas 3" />
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Familia *</div>
                                    <select value={fFamilia} onChange={(e) => setFFamilia(e.target.value)} style={modal.input}>
                                        <option value="">Seleccionar…</option>
                                        <option value="Montacargas">Montacargas</option>
                                        <option value="Apilador">Apilador</option>
                                        <option value="Carretilla">Carretilla</option>
                                    </select>
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Marca</div>
                                    <input value={fMarca} onChange={(e) => setFMarca(e.target.value)} style={modal.input} placeholder="n/a" />
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Propiedad</div>
                                    <select
                                        value={fPropiedad}
                                        onChange={(e) => setFPropiedad(e.target.value)}
                                        style={modal.input}
                                    >
                                        <option value="Propio">Propio</option>
                                        <option value="Alquilado">Alquilado</option>
                                    </select>
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Responsable</div>
                                    <input value={fResponsable} onChange={(e) => setFResponsable(e.target.value)} style={modal.input} placeholder="Nombre responsable" />
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Suplente</div>
                                    <input value={fSuplente} onChange={(e) => setFSuplente(e.target.value)} style={modal.input} placeholder="N/A" />
                                </div>
                                <div style={modal.field}>
                                    <div style={modal.label}>Estado</div>
                                    <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={modal.input}>
                                        <option value="Activo">Activo</option>
                                        <option value="Inactivo">Inactivo</option>
                                        <option value="Mantenimiento">Mantenimiento</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div style={modal.actions}>
                            <button type="button" style={ui.btnGhost} onClick={closeAddEquipo} disabled={addSaving}>
                                Cancelar
                            </button>
                            <button type="button" style={ui.btnPrimary} onClick={() => void saveEquipo()} disabled={addSaving}>
                                {addSaving ? "Guardando…" : "Guardar equipo"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const ui = {
    shell: {
        width: "100%",
        maxWidth: "100vw",
        minHeight: "100vh",
        background: "#F6F7FB",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        color: "#0F172A",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        boxSizing: "border-box",
    },

    cardCode: {
        fontWeight: 950,
        color: "#94A3B8",
        fontSize: 12,
        lineHeight: "14px",
    },

    topbar: {
        width: "100%",
        boxSizing: "border-box",
        padding: "12px 18px",
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #E7E9F2",
        background:
            "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
        backdropFilter: "blur(8px)",
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
        borderRadius: 14,
        padding: "4px 8px 4px 4px",
        margin: "-4px -8px -4px -4px",
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
        fontWeight: 950,
        letterSpacing: 0.4,
        boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
        flexShrink: 0,
    },
    topbarActions: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "flex-end",
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
    kpiHint: { fontWeight: 800, fontSize: 11, color: "#94A3B8" },

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
        transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, background 120ms ease",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
    },
    btnGhostActive: {
        border: `1px solid ${ACCENT}`,
        background: ACCENT_SOFT,
        color: ACCENT,
        boxShadow: "0 10px 24px rgba(8,159,138,0.12)",
    },

    btnPrimary: {
        border: `1px solid ${ACCENT}`,
        background: ACCENT,
        color: "#fff",
        borderRadius: 14,
        padding: "10px 12px",
        cursor: "pointer",
        fontWeight: 950,
        boxShadow: "0 12px 28px rgba(8,159,138,0.18)",
        whiteSpace: "nowrap",
        transition: "transform 120ms ease, box-shadow 120ms ease",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "inherit",
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
        position: "relative",
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 20,
        padding: 16,
        paddingTop: 18,
        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
        overflow: "hidden",
    },
    headerAccent: {
        position: "absolute",
        left: 0,
        top: 0,
        height: 4,
        width: "100%",
        background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
    },
    errorBanner: {
        marginTop: 12,
        borderRadius: 14,
        padding: "12px 14px",
        background: "#FFF6F6",
        border: "1px solid rgba(239,68,68,0.25)",
        color: "#9A1D1D",
        fontWeight: 850,
        fontSize: 13,
        lineHeight: 1.4,
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
    headerActions: {
        marginTop: 16,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
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
        boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
        display: "grid",
        gap: 8,
        alignContent: "start",
        minHeight: 0,
        transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
        outline: "none",
    },
    cardBgRed: {
        background: "linear-gradient(165deg, #FFF1F1 0%, #FFE4E4 55%, #FEF2F2 100%)",
        borderColor: "rgba(220, 38, 38, 0.32)",
        boxShadow: "0 12px 28px rgba(220, 38, 38, 0.08)",
    },
    cardBgYellow: {
        background: "linear-gradient(165deg, #FFFBEB 0%, #FEF3C7 50%, #FFFBF0 100%)",
        borderColor: "rgba(217, 119, 6, 0.35)",
        boxShadow: "0 12px 28px rgba(217, 119, 6, 0.09)",
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
        gap: 6,
    },
    warnBadgeOnRed: {
        border: "1px solid rgba(220, 38, 38, 0.35)",
        background: "rgba(255,255,255,0.9)",
    },
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
    iconCircleOnRed: {
        background: "rgba(255,255,255,0.82)",
        borderColor: "rgba(220, 38, 38, 0.2)",
    },
    iconCircleOnYellow: {
        background: "rgba(255,255,255,0.82)",
        borderColor: "rgba(217, 119, 6, 0.22)",
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
        border: "1px dashed #D7DEE8",
        background: "linear-gradient(180deg, #fff 0%, #FBFCFF 100%)",
        padding: "28px 20px",
        textAlign: "center",
        maxWidth: 480,
        margin: "0 auto",
        justifySelf: "center",
    },
    emptyTitle: {
        fontWeight: 950,
        fontSize: 16,
        color: "#0F172A",
        marginBottom: 8,
    },
    emptyText: {
        fontWeight: 800,
        fontSize: 13,
        color: "#64748B",
        lineHeight: 1.45,
        margin: 0,
    },
    emptyBtn: {
        marginTop: 16,
        borderRadius: 14,
        border: `1px solid ${ACCENT}`,
        background: ACCENT_SOFT,
        color: ACCENT,
        padding: "10px 18px",
        fontWeight: 950,
        cursor: "pointer",
    },
    skeletonCard: {
        borderRadius: 18,
        border: "1px solid #EEF1F7",
        background: "#fff",
        padding: 14,
        display: "grid",
        gap: 10,
        minHeight: 168,
        animation: "panelEquiposPulse 1.4s ease-in-out infinite",
    },
    skeletonIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        background: "linear-gradient(90deg, #F1F5F9 0%, #E8EDF4 50%, #F1F5F9 100%)",
        backgroundSize: "200% 100%",
    },
    skeletonLine: {
        height: 12,
        borderRadius: 8,
        width: "78%",
        background: "linear-gradient(90deg, #F1F5F9 0%, #E8EDF4 50%, #F1F5F9 100%)",
        backgroundSize: "200% 100%",
    },
};

const modal = {
    backdrop: {
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 9999,
    },
    sheet: {
        width: "min(720px, 100%)",
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
    },
    header: {
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid #EEF1F7",
        background: "#FBFCFF",
    },
    icon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        background: ACCENT_SOFT,
        border: "1px solid rgba(8,159,138,0.25)",
        color: ACCENT,
        display: "grid",
        placeItems: "center",
    },
    title: { fontWeight: 980, color: "#0F172A" },
    sub: { marginTop: 2, fontWeight: 850, color: "#64748B", fontSize: 12 },
    close: {
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 14,
        width: 36,
        height: 36,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        color: "#0F172A",
    },
    body: { padding: 14, background: "#fff" },
    actions: { padding: 14, display: "flex", gap: 10, justifyContent: "flex-end", background: "#fff" },
    error: {
        borderRadius: 14,
        padding: "10px 12px",
        background: "#FFF6F6",
        border: "1px solid rgba(239,68,68,0.22)",
        color: "#9A1D1D",
        fontWeight: 800,
        fontSize: 13,
        marginBottom: 10,
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
        gap: 12,
    },
    field: { display: "grid", gap: 6 },
    label: { fontWeight: 900, fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 },
    input: {
        borderRadius: 14,
        border: "1px solid #E7E9F2",
        background: "#fff",
        padding: "10px 12px",
        outline: "none",
        fontWeight: 850,
        color: "#0F172A",
        fontFamily: "inherit",
    },
};