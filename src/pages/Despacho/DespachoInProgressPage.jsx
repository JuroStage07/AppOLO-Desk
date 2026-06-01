// src/pages/despachos/DespachoInProgressPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
    ArrowLeft,
    Loader2,
    Package,
    Truck,
    RefreshCcw,
} from "lucide-react";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import useIsMobile from "../../hooks/useIsMobile";
import {
    Brand,
    GhostButton,
    Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const SLATE = "#64748B";
const CAPACITY = 24;

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function deriveSlotsFromFotos(fotos = [], capacity = CAPACITY) {
    const slots = Array.from({ length: capacity }, () => ({
        type: "E",
        lotId: null,
        part: null,
    }));

    const byLot = new Map();

    for (const raw of Array.isArray(fotos) ? fotos : []) {
        const f = raw || {};
        if (!f.lotId) continue;

        const current = byLot.get(f.lotId) || {
            tarima: f.tarima || "S",
            bases: [],
        };

        if (f.slotNumber) current.bases.push(Number(f.slotNumber));
        if (!current.tarima && f.tarima) current.tarima = f.tarima;

        byLot.set(f.lotId, current);
    }

    const lenFor = (t) => (t === "C" ? 4 : t === "T" ? 3 : t === "D" ? 2 : 1);

    for (const [lotId, data] of byLot.entries()) {
        const type = data.tarima || "S";
        const L = lenFor(type);

        if (type === "S") {
            const pos = data.bases[0];
            if (pos && pos >= 1 && pos <= capacity && slots[pos - 1].type === "E") {
                slots[pos - 1] = { type: "S", lotId, part: 1 };
            }
        } else if (type === "D") {
            data.bases.slice(0, 2).forEach((pos, idx) => {
                if (pos && pos >= 1 && pos <= capacity && slots[pos - 1].type === "E") {
                    slots[pos - 1] = { type: "D", lotId, part: idx + 1 };
                }
            });
        } else if (type === "T" || type === "C") {
            const base = data.bases[0];
            if (base && base >= 1 && base <= capacity) {
                for (let j = 0; j < L; j++) {
                    const p = base + j * 2;
                    if (p <= capacity && slots[p - 1].type === "E") {
                        slots[p - 1] = { type, lotId, part: j + 1 };
                    }
                }
            }
        }
    }

    const usedUnits = slots.reduce((acc, s) => acc + (s.type === "E" ? 0 : 1), 0);
    return {
        slots,
        usedUnits,
        progress: Math.min(100, Math.round((usedUnits / capacity) * 100)),
    };
}

function mapLayoutSlots(layoutSlots = [], capacity = CAPACITY) {
    const slots = layoutSlots.slice(0, capacity).map((cell) => ({
        type: cell?.type || "E",
        lotId: cell?.lotId || null,
        part: cell?.part ?? null,
    }));

    while (slots.length < capacity) {
        slots.push({ type: "E", lotId: null, part: null });
    }

    const usedUnits = slots.reduce((acc, s) => acc + (s.type === "E" ? 0 : 1), 0);

    return {
        slots,
        usedUnits,
        progress: Math.min(100, Math.round((usedUnits / capacity) * 100)),
    };
}

function summarizeTarimas(fotos = []) {
    const byLot = new Map();

    for (const f of fotos || []) {
        if (!f?.lotId) continue;
        if (!byLot.has(f.lotId)) byLot.set(f.lotId, f.tarima || "S");
    }

    let sCount = 0;
    let dCount = 0;
    let tCount = 0;

    for (const t of byLot.values()) {
        if (t === "S") sCount += 1;
        else if (t === "D") dCount += 1;
        else if (t === "T") tCount += 1;
    }

    return { sCount, dCount, tCount };
}

function getSlotColor(type) {
    if (type === "E") return "#E5E7EB";
    if (type === "S") return "#60A5FA";
    if (type === "D") return "#F59E0B";
    if (type === "T") return "#8B5CF6";
    if (type === "C") return "#EF4444";
    return "#CBD5E1";
}

function SlotGrid({ slots = [] }) {
    const left = Array.from({ length: 12 }, (_, i) => i * 2 + 1);
    const right = Array.from({ length: 12 }, (_, i) => (i + 1) * 2);

    const renderCol = (nums) => (
        <div style={ui.gridCol}>
            {nums.map((num) => {
                const slot = slots[num - 1] || { type: "E" };
                return (
                    <div
                        key={num}
                        title={`Posición ${num} · ${slot.type}`}
                        style={{
                            ...ui.slotCell,
                            background: getSlotColor(slot.type),
                        }}
                    >
                        <span style={ui.slotCellText}>{num}</span>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div style={ui.gridWrap}>
            {renderCol(left)}
            {renderCol(right)}
        </div>
    );
}

function ProgressBar({ value = 0 }) {
    return (
        <div style={ui.progressOuter}>
            <div style={{ ...ui.progressInner, width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
    );
}

function DespachoCard({ item }) {
    const layout = useMemo(() => {
        if (Array.isArray(item.layoutSlots) && item.layoutSlots.length > 0) {
            return mapLayoutSlots(item.layoutSlots);
        }
        return deriveSlotsFromFotos(item.fotos || []);
    }, [item.layoutSlots, item.fotos]);

    const counts = useMemo(() => summarizeTarimas(item.fotos || []), [item.fotos]);

    return (
        <div style={ui.card}>
            <div style={ui.cardTop}>
                <div>
                    <div style={ui.cardTitle}>{item.referencia || "Sin referencia"}</div>
                    <div style={ui.cardSub}>
                        Tienda: <b>{item.tienda || "—"}</b> · Placa: <b>{item.placa || "—"}</b>
                    </div>
                    <div style={ui.cardSub}>
                        Estado: <b>{item.estado || "en proceso"}</b>
                    </div>
                </div>

                <div style={ui.badgeLive}>En tiempo real</div>
            </div>

            <div style={ui.kpiRow}>
                <div style={ui.kpiMini}>
                    <div style={ui.kpiMiniLabel}>S</div>
                    <div style={ui.kpiMiniValue}>{counts.sCount}</div>
                </div>
                <div style={ui.kpiMini}>
                    <div style={ui.kpiMiniLabel}>D</div>
                    <div style={ui.kpiMiniValue}>{counts.dCount}</div>
                </div>
                <div style={ui.kpiMini}>
                    <div style={ui.kpiMiniLabel}>T</div>
                    <div style={ui.kpiMiniValue}>{counts.tCount}</div>
                </div>
                <div style={ui.kpiMini}>
                    <div style={ui.kpiMiniLabel}>Ocupado</div>
                    <div style={ui.kpiMiniValue}>
                        {layout.usedUnits}/{CAPACITY}
                    </div>
                </div>
            </div>

            <ProgressBar value={layout.progress} />

            <div style={ui.progressText}>{layout.progress}% ocupado</div>

            <div style={ui.cardBody}>
                <SlotGrid slots={layout.slots} />
            </div>

            <div style={ui.legendRow}>
                <Legend color="#E5E7EB" label="Libre" />
                <Legend color="#60A5FA" label="S" />
                <Legend color="#F59E0B" label="D" />
                <Legend color="#8B5CF6" label="T" />
                <Legend color="#EF4444" label="C" />
            </div>
        </div>
    );
}

function Legend({ color, label }) {
    return (
        <div style={ui.legendItem}>
            <span style={{ ...ui.legendDot, background: color }} />
            <span>{label}</span>
        </div>
    );
}

export default function DespachoInProgressPage() {
    const nav = useNavigate();
    const user = auth.currentUser;
    const isMobile = useIsMobile();

    const [tenantScope, setTenantScope] = useState({ tenantId: "", company: "" });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [despachos, setDespachos] = useState([]);

    useEffect(() => {
        let unsubDespachos = () => { };
        const childUnsubs = new Map();

        async function boot() {
            try {
                setLoading(true);
                setError("");

                const currentUser = auth.currentUser;
                if (!currentUser?.uid) {
                    setError("No hay usuario autenticado.");
                    setLoading(false);
                    return;
                }

                const profileSnap = await getDoc(doc(db, "profiles", currentUser.uid));
                const profile = profileSnap.exists() ? profileSnap.data() || {} : {};

                const tenantId = String(profile?.tenantId || "").trim();
                const company = String(profile?.company || "").trim();

                setTenantScope({ tenantId, company });

                if (!tenantId || !company) {
                    setError("El perfil no tiene tenantId o company.");
                    setLoading(false);
                    return;
                }

                const q = query(
                    collection(db, "despachos"),
                    where("tenantId", "==", tenantId),
                    where("company", "==", company),
                    where("estado", "==", "en proceso"),
                    orderBy("createdAt", "desc")
                );

                unsubDespachos = onSnapshot(
                    q,
                    (snap) => {
                        const baseRows = snap.docs.map((d) => ({
                            id: d.id,
                            ...d.data(),
                            fotos: [],
                            layoutSlots: [],
                        }));

                        setDespachos((prev) => {
                            const prevMap = new Map(prev.map((x) => [x.id, x]));
                            return baseRows.map((row) => ({
                                ...prevMap.get(row.id),
                                ...row,
                                fotos: prevMap.get(row.id)?.fotos || [],
                                layoutSlots: prevMap.get(row.id)?.layoutSlots || [],
                            }));
                        });

                        const nextIds = new Set(baseRows.map((x) => x.id));

                        for (const [id, cleanup] of childUnsubs.entries()) {
                            if (!nextIds.has(id)) {
                                cleanup();
                                childUnsubs.delete(id);
                            }
                        }

                        for (const row of baseRows) {
                            if (childUnsubs.has(row.id)) continue;

                            const unsubLayout = onSnapshot(
                                doc(db, "despachos", row.id, "layout", "state"),
                                (layoutSnap) => {
                                    const data = layoutSnap.data();
                                    setDespachos((prev) =>
                                        prev.map((x) =>
                                            x.id === row.id
                                                ? { ...x, layoutSlots: Array.isArray(data?.slots) ? data.slots : [] }
                                                : x
                                        )
                                    );
                                }
                            );

                            const fotosQ = query(
                                collection(db, "despachos", row.id, "fotos"),
                                orderBy("createdAt", "desc")
                            );

                            const unsubFotos = onSnapshot(fotosQ, (fotoSnap) => {
                                const fotos = fotoSnap.docs.map((fd) => ({
                                    id: fd.id,
                                    ...fd.data(),
                                }));

                                setDespachos((prev) =>
                                    prev.map((x) => (x.id === row.id ? { ...x, fotos } : x))
                                );
                            });

                            childUnsubs.set(row.id, () => {
                                unsubLayout();
                                unsubFotos();
                            });
                        }

                        setLoading(false);
                    },
                    (err) => {
                        console.error("despachos onSnapshot error:", err);
                        setError(err?.message || "No se pudieron cargar los despachos en proceso.");
                        setLoading(false);
                    }
                );
            } catch (e) {
                console.error(e);
                setError("No se pudieron cargar los despachos.");
                setLoading(false);
            }
        }

        boot();

        return () => {
            unsubDespachos();
            for (const cleanup of childUnsubs.values()) cleanup();
        };
    }, []);

    return (
        <div style={{ ...ui.shell, ...(isMobile ? ui.mShell : {}) }}>
            <Topbar>
                <Brand
                    icon={Truck}
                    title="Despachos"
                    subtitle="Despachos abiertos en tiempo real"
                    onClick={() => nav("/despacho")}
                />
                <Topbar.Right>
                    <Topbar.UserHint title={user?.email || ""}>
                        {user?.displayName || user?.email || "Sesión activa"}
                    </Topbar.UserHint>
                    <GhostButton icon={ArrowLeft} onClick={() => nav("/despacho")}>
                        Volver
                    </GhostButton>
                </Topbar.Right>
            </Topbar>

            <main style={ui.main}>
                <div style={ui.container}>
                    <div style={ui.hero}>
                        <div>
                            <h1 style={ui.title}>Despachos en progreso</h1>
                            <p style={ui.subtitle}>
                                Vista viva de despachos abiertos, ocupación de 24 espacios y avance de carga.
                            </p>
                        </div>

                        <div style={ui.heroMeta}>
                            <div><b>Tenant:</b> {tenantScope.tenantId || "—"}</div>
                            <div><b>Company:</b> {tenantScope.company || "—"}</div>
                        </div>
                    </div>

                    {loading && (
                        <div style={ui.infoBanner}>
                            <span style={ui.btnInlineIcon}>
                                <Loader2 size={18} style={{ animation: "spin 0.8s linear infinite" }} />
                                Cargando despachos...
                            </span>
                        </div>
                    )}

                    {!!error && !loading && <div style={ui.errorBanner}>{error}</div>}

                    {!loading && !error && despachos.length === 0 && (
                        <div style={ui.emptyCard}>
                            <Package size={22} />
                            <div style={ui.emptyTitle}>No hay despachos abiertos</div>
                            <div style={ui.emptyText}>Cuando existan despachos en proceso aparecerán aquí.</div>
                        </div>
                    )}

                    <div style={ui.cardsGrid}>
                        {despachos.map((item) => (
                            <DespachoCard key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            </main>

            <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}

const ui = {
    shell: {
        minHeight: "100vh",
        height: "100dvh",
        background: "#F6F7FB",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        color: "#0F172A",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        overflow: "hidden",
    },
    mShell: {},
    topbar: {
        width: "100%",
        borderBottom: "1px solid #E7E9F2",
        background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    },
    topbarInner: {
        maxWidth: 1120,
        margin: "0 auto",
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
    },
    brandMark: {
        width: 44,
        height: 44,
        borderRadius: 14,
        background: ACCENT,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
    },
    brandTitle: { fontWeight: 950, fontSize: 14 },
    brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },
    topbarRight: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
    },
    userBox: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 14,
        padding: "8px 12px",
    },
    userAvatar: {
        width: 32,
        height: 32,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: "rgba(8,159,138,0.12)",
        color: ACCENT,
    },
    userName: { fontWeight: 800, fontSize: 13 },
    userMail: { fontSize: 12, color: SLATE },
    btnGhost: {
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 12,
        padding: "9px 14px",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 13,
    },
    btnInlineIcon: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
    },
    main: {
        minHeight: 0,
        overflow: "auto",
        padding: "18px 16px 28px",
        WebkitOverflowScrolling: "touch",
    },
    container: {
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        display: "grid",
        gap: 16,
    },
    hero: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 22,
        padding: 20,
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
    },
    title: {
        margin: 0,
        fontSize: 28,
        fontWeight: 950,
    },
    subtitle: {
        margin: "8px 0 0",
        color: SLATE,
        fontWeight: 600,
    },
    heroMeta: {
        fontSize: 13,
        color: SLATE,
        display: "grid",
        gap: 6,
    },
    infoBanner: {
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        color: "#1D4ED8",
        borderRadius: 16,
        padding: 14,
        fontWeight: 700,
    },
    errorBanner: {
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        color: "#B91C1C",
        borderRadius: 16,
        padding: 14,
        fontWeight: 700,
    },
    emptyCard: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 18,
        padding: 24,
        display: "grid",
        gap: 8,
        placeItems: "center",
    },
    emptyTitle: { fontWeight: 900, fontSize: 16 },
    emptyText: { color: SLATE, fontSize: 13, textAlign: "center" },
    cardsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 16,
    },
    card: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12,
        boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
    },
    cardTop: {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
    },
    cardTitle: { fontSize: 16, fontWeight: 900 },
    cardSub: { color: SLATE, fontSize: 12, marginTop: 4 },
    badgeLive: {
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(8,159,138,0.12)",
        color: ACCENT,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
    },
    kpiRow: {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
    },
    kpiMini: {
        border: "1px solid #E7E9F2",
        background: "#FBFBFE",
        borderRadius: 12,
        padding: 10,
    },
    kpiMiniLabel: {
        fontSize: 11,
        color: SLATE,
        fontWeight: 800,
    },
    kpiMiniValue: {
        marginTop: 4,
        fontSize: 18,
        fontWeight: 900,
    },
    progressOuter: {
        height: 10,
        borderRadius: 999,
        background: "#E5E7EB",
        overflow: "hidden",
    },
    progressInner: {
        height: "100%",
        background: ACCENT,
    },
    progressText: {
        fontSize: 12,
        color: SLATE,
        fontWeight: 800,
    },
    cardBody: {
        display: "flex",
        justifyContent: "center",
    },
    gridWrap: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 0",
    },
    gridCol: {
        display: "grid",
        gap: 6,
    },
    slotCell: {
        width: 34,
        height: 34,
        borderRadius: 8,
        border: "1px solid #D1D5DB",
        display: "grid",
        placeItems: "center",
    },
    slotCellText: {
        fontSize: 10,
        fontWeight: 900,
        color: "#111827",
    },
    legendRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "center",
    },
    legendItem: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: SLATE,
        fontWeight: 700,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 4,
        border: "1px solid #D1D5DB",
        display: "inline-block",
    },
};