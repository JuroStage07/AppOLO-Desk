// screens/aperturas/AperturasRechazadas.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

import {
  ArrowLeft,
  ArrowRight,
  Ban,
  ClipboardList,
  Filter,
  Loader2,
  LogOut,
  User,
} from "lucide-react";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { filterByUserScope } from "../../../utils/dataScope";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

/* ===================== Date helpers ===================== */
const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatDateTime = (value) => {
  const d = toDateSafe(value);
  if (!d) return "—";

  let s = d.toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  s = s.replace(/\u00A0/g, " ").trim();
  s = s
    .replace(/\bAM\b/i, "a. m.")
    .replace(/\bPM\b/i, "p. m.")
    .replace(/\ba\.m\.\b/i, "a. m.")
    .replace(/\bp\.m\.\b/i, "p. m.");
  s = s.replace(/(\b[a-záéíóúñ]{3,})\./gi, "$1");
  return s;
};

/* ===================== Data listener ===================== */
// ✅ Listener listo (no dependés de otro service)
function listenAperturasRechazadas(setItems, tenantId, company) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "rechazada"),
    orderBy("tiempoRechazada", "desc"),
    limit(400)
  );

  return onSnapshot(
    qy,
    (snap) => {
      const out = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantId,
        company
      );
      setItems(out);
    },
    (err) => {
      console.error("listenAperturasRechazadas error:", err);
      setItems([]);
    }
  );
}

const MOTIVOS = [
  "Todos",
  "Informacion incompleta",
  "Informacion erronea",
  "Marchamo comprometido",
  "Descarga ya iniciada",
  "Otro",
];

export default function AperturasRechazadas() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [busyLogout, setBusyLogout] = useState(false);
  const [items, setItems] = useState([]);
  const [motivoFiltro, setMotivoFiltro] = useState("Todos");

  useEffect(() => {
    if (authLoading) return;
    const unsub = listenAperturasRechazadas(
      setItems,
      profile?.tenantId,
      profile?.company
    );
    return () => unsub?.();
  }, [authLoading, profile?.tenantId, profile?.company]);

  const filtered = useMemo(() => {
    if (motivoFiltro === "Todos") return items;
    return items.filter((it) => it?.rechazo?.motivo === motivoFiltro);
  }, [items, motivoFiltro]);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const goDetalle = (id) => {
    // ✅ ajustá la ruta si tu detalle es otra
    nav(`/salud/aperturas/detalle/${encodeURIComponent(id)}?source=rechazada`);
  };

  return (
    <div style={ui.shell}>
      <style>{`
        @keyframes rechazadasSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div
            style={ui.brand}
            role="button"
            tabIndex={0}
            onClick={() => nav("/salud/aperturas")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/salud/aperturas")}
          >
            <div style={ui.brandMark}>
              <ClipboardList size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Aperturas</div>
              <div style={ui.brandSub}>Rechazadas</div>
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

            <button type="button" onClick={() => nav("/salud/aperturas")} style={ui.btnGhost} disabled={busyLogout}>
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} strokeWidth={2.2} />
                Administrar
              </span>
            </button>

            <button
              type="button"
              onClick={logout}
              style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
              disabled={busyLogout}
            >
              <span style={ui.btnInlineIcon}>
                {busyLogout ? (
                  <Loader2
                    size={16}
                    strokeWidth={2.2}
                    style={{ animation: "rechazadasSpin 0.7s linear infinite" }}
                  />
                ) : (
                  <LogOut size={16} strokeWidth={2.2} />
                )}
                {busyLogout ? "Cerrando…" : "Salir"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
          <div style={ui.filtersCard}>
            <div style={ui.filtersHead}>
              <Filter size={18} color={ACCENT} strokeWidth={2.2} />
              <div style={ui.filtersTitle}>Filtrar por motivo</div>
            </div>
            <div style={ui.chipsRow}>
              {MOTIVOS.map((m) => {
                const active = motivoFiltro === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMotivoFiltro(m)}
                    style={{ ...ui.chip, ...(active ? ui.chipActive : {}) }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIconWrap}>
                <Ban size={26} strokeWidth={2} color={SLATE} />
              </div>
              <div style={ui.emptyTitle}>
                {motivoFiltro === "Todos"
                  ? "No hay aperturas rechazadas."
                  : `No hay rechazadas con motivo «${motivoFiltro}».`}
              </div>
              <div style={ui.emptyText}>Probá cambiando el filtro de motivo.</div>
            </div>
          ) : (
            <div style={ui.listGrid}>
              {filtered.map((item) => {
                const motivo = item?.rechazo?.motivo || "—";
                const detalle = item?.rechazo?.detalle || null;
                const rechazadoPor =
                  item?.rechazo?.rechazadoPorNombre ||
                  item?.rechazo?.rechazadoPorUid ||
                  "—";
                const fechaRechazo = formatDateTime(
                  item?.rechazo?.rechazadoAt || item?.tiempoRechazada
                );

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goDetalle(item.id)}
                    style={ui.cardBtn}
                    title="Ver detalle"
                  >
                    <div style={ui.cardAccentBar} aria-hidden />
                    <div style={ui.cardTop}>
                      <div style={ui.badgeIcon}>
                        <Ban size={20} strokeWidth={2.2} color="#B91C1C" />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={ui.cardTitle} title={item?.nombre || "—"}>
                          {item?.nombre || "—"}
                        </div>
                        <div style={ui.cardSub} title={item?.tipo || "—"}>
                          {item?.tipo || "—"}
                        </div>
                      </div>

                      <div style={ui.dateTxt}>{fechaRechazo}</div>
                    </div>

                    <div style={ui.metaRow}>
                      <div style={ui.metaLabel}>Motivo</div>
                      <div style={ui.metaValue}>{motivo}</div>
                    </div>

                    {motivo === "Otro" && detalle ? (
                      <div style={ui.metaRow}>
                        <div style={ui.metaLabel}>Detalle</div>
                        <div style={ui.metaValue}>{detalle}</div>
                      </div>
                    ) : null}

                    <div style={ui.metaRow}>
                      <div style={ui.metaLabel}>Rechazado por</div>
                      <div style={ui.metaValue}>{rechazadoPor}</div>
                    </div>

                    <div style={ui.cta}>
                      <span style={ui.btnInlineIcon}>
                        Ver detalle
                        <ArrowRight size={14} strokeWidth={2.5} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ===================== Styles ===================== */
const ui = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
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
  btnInlineIcon: { display: "inline-flex", alignItems: "center", gap: 8 },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

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

  filtersCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    borderTop: `3px solid ${ACCENT_SOFT}`,
    display: "grid",
    gap: 12,
  },
  filtersHead: { display: "flex", alignItems: "center", gap: 10 },
  filtersTitle: { fontWeight: 950, color: "#0F172A", fontSize: 15 },

  chipsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    padding: "8px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#334155",
    fontFamily: "inherit",
  },
  chipActive: {
    background: ACCENT_SOFT,
    borderColor: "rgba(8,159,138,0.45)",
    color: "#0F172A",
    boxShadow: "0 4px 14px rgba(8,159,138,0.12)",
  },

  emptyWrap: {
    padding: 24,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    gap: 8,
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    borderTop: `3px solid ${ACCENT_SOFT}`,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: 950, color: "#0F172A", textAlign: "center", fontSize: 16 },
  emptyText: { color: SLATE, fontWeight: 650, textAlign: "center", fontSize: 14 },

  listGrid: { display: "grid", gap: 12 },

  cardBtn: {
    position: "relative",
    textAlign: "left",
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 18,
    padding: 16,
    paddingTop: 18,
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    overflow: "hidden",
    fontFamily: "inherit",
  },
  cardAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: "rgba(220, 38, 38, 0.35)",
  },

  cardTop: { display: "flex", alignItems: "center", gap: 12 },

  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
  },

  cardTitle: {
    fontWeight: 950,
    color: "#0F172A",
    fontSize: 15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardSub: {
    marginTop: 4,
    color: SLATE,
    fontWeight: 650,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  dateTxt: { color: SLATE, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },

  metaRow: { display: "flex", gap: 10, marginTop: 10, alignItems: "baseline" },
  metaLabel: {
    color: SLATE,
    fontWeight: 800,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.04,
    whiteSpace: "nowrap",
  },
  metaValue: { color: "#0F172A", fontWeight: 650, flex: 1, minWidth: 0, fontSize: 14 },

  cta: {
    marginTop: 14,
    fontWeight: 850,
    fontSize: 13,
    color: ACCENT,
    display: "flex",
    alignItems: "center",
  },
};