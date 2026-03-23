// screens/aperturas/AperturasRechazadas.jsx
import React, { useEffect, useMemo, useState } from "react";
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

import { auth, db } from "../../firebase";

const ACCENT = "#089F8A";

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
function listenAperturasRechazadas(setItems) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "rechazada"),
    orderBy("tiempoRechazada", "desc"),
    limit(400)
  );

  return onSnapshot(
    qy,
    (snap) => {
      const out = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  const [busyLogout, setBusyLogout] = useState(false);
  const [items, setItems] = useState([]);
  const [motivoFiltro, setMotivoFiltro] = useState("Todos");

  useEffect(() => {
    const unsub = listenAperturasRechazadas(setItems);
    return () => unsub?.();
  }, []);

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
      {/* Topbar */}
      <div style={ui.topbar}>
        <div
          style={ui.brand}
          role="button"
          tabIndex={0}
          onClick={() => nav("/salud/aperturas")}
        >
          <div style={ui.brandMark}>AP</div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>Aperturas</div>
            <div style={ui.brandSub}>Rechazadas</div>
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

          <button
            type="button"
            onClick={() => nav("/salud/aperturas")}
            style={ui.btnGhost}
            disabled={busyLogout}
          >
            ← Administrar
          </button>

          <button
            type="button"
            onClick={logout}
            style={{ ...ui.btnGhost, ...(busyLogout ? ui.btnDisabled : {}) }}
            disabled={busyLogout}
          >
            {busyLogout ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={ui.main}>
        <div style={ui.container}>
          {/* Filtros */}
          <div style={ui.filtersCard}>
            <div style={ui.filtersTitle}>Filtrar por motivo</div>
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
                    <span style={{ ...ui.chipTxt, ...(active ? ui.chipTxtActive : {}) }}>
                      {m}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIcon}>🚫</div>
              <div style={ui.emptyTitle}>
                {motivoFiltro === "Todos"
                  ? "No hay aperturas rechazadas."
                  : `No hay rechazadas con motivo "${motivoFiltro}".`}
              </div>
              <div style={ui.emptyText}>Probá cambiando el filtro.</div>
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
                    <div style={ui.cardTop}>
                      <div style={ui.badge}>
                        <span style={ui.badgeTxt}>🚫</span>
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
                      <div style={ui.metaLabel}>Motivo:</div>
                      <div style={ui.metaValue}>{motivo}</div>
                    </div>

                    {motivo === "Otro" && detalle ? (
                      <div style={ui.metaRow}>
                        <div style={ui.metaLabel}>Detalle:</div>
                        <div style={ui.metaValue}>{detalle}</div>
                      </div>
                    ) : null}

                    <div style={ui.metaRow}>
                      <div style={ui.metaLabel}>Rechazado por:</div>
                      <div style={ui.metaValue}>{rechazadoPor}</div>
                    </div>

                    <div style={ui.cta}>Ver detalle →</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Styles ===================== */
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
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(246,247,251,0.95) 100%)",
    backdropFilter: "blur(6px)",
  },

  brand: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" },
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

  topbarRight: { display: "flex", alignItems: "center", gap: 12 },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
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
  },
  userName: { fontWeight: 980, fontSize: 12, color: "#0F172A", lineHeight: 1.1 },
  userMail: { fontWeight: 850, fontSize: 12, color: "#64748B", lineHeight: 1.1 },

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
  btnDisabled: { opacity: 0.6, cursor: "not-allowed", boxShadow: "none" },

  main: { overflow: "auto", padding: 16, display: "grid", placeItems: "start center" },
  container: { width: "min(1100px, 100%)", display: "grid", gap: 14, paddingBottom: 24 },

  filtersCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
    display: "grid",
    gap: 10,
  },
  filtersTitle: { fontWeight: 980, color: "#0F172A" },

  chipsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F2F4FB",
    padding: "10px 12px",
    cursor: "pointer",
  },
  chipActive: { background: "#12131a", borderColor: "#12131a" },
  chipTxt: { color: "#12131a", fontWeight: 950, fontSize: 12 },
  chipTxtActive: { color: "#fff" },

  emptyWrap: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    display: "grid",
    placeItems: "center",
    gap: 6,
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: 980, color: "#0F172A", textAlign: "center" },
  emptyText: { color: "#64748B", fontWeight: 850, textAlign: "center" },

  listGrid: { display: "grid", gap: 10 },

  cardBtn: {
    textAlign: "left",
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 18,
    padding: 14,
    cursor: "pointer",
    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
  },

  cardTop: { display: "flex", alignItems: "center", gap: 10 },

  badge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: "#FDEAEA",
    border: "1px solid #F6C2C2",
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
  },
  badgeTxt: { fontSize: 18 },

  cardTitle: {
    fontWeight: 980,
    color: "#111",
    fontSize: 15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardSub: {
    marginTop: 2,
    color: "#555",
    fontWeight: 850,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  dateTxt: { color: "#777", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" },

  metaRow: { display: "flex", gap: 6, marginTop: 10 },
  metaLabel: { color: "#5a6072", fontWeight: 950, whiteSpace: "nowrap" },
  metaValue: { color: "#12131a", fontWeight: 850, flex: 1, minWidth: 0 },

  cta: { marginTop: 12, fontWeight: 980, color: "#B71C1C" },
};