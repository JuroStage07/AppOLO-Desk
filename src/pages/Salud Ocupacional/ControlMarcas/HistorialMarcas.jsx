import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { ArrowLeft, History } from "lucide-react";
import { db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { filterByUserScope } from "../../../utils/dataScope";
import {
  Brand,
  GhostButton,
  Topbar,
} from "../../../components/ui";

const ACCENT = "#089F8A";
const DANGER = "#DC2626";

function getTodayId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMarcaMs(marca) {
  const ts = marca?.createdAt;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

function formatDateTime(marca) {
  const ts = marca?.createdAt;
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate().toLocaleString("es-CR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  }
  return marca?.horaTexto || "Sin hora";
}

function buildUsuariosConMarcas(marcas) {
  const byUser = new Map();
  for (const marca of marcas) {
    const usuarioId = String(marca.usuarioId || "").trim();
    if (!usuarioId) continue;

    const current = byUser.get(usuarioId);
    const next = {
      id: usuarioId,
      nombre: marca.nombre || "Sin nombre",
      cedula: marca.cedula || "",
      empresa: marca.empresa || marca.company || "",
      count: (current?.count || 0) + 1,
    };

    byUser.set(usuarioId, current ? { ...current, count: next.count } : next);
  }

  return [...byUser.values()].sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre))
  );
}

export default function HistorialMarcas() {
  const nav = useNavigate();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [dia, setDia] = useState(() => getTodayId());
  const [marcasDia, setMarcasDia] = useState([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const usuariosConMarcas = useMemo(
    () => buildUsuariosConMarcas(marcasDia),
    [marcasDia]
  );

  const marcasUsuario = useMemo(() => {
    if (!usuarioId) return [];
    return marcasDia
      .filter((marca) => marca.usuarioId === usuarioId)
      .sort((a, b) => getMarcaMs(a) - getMarcaMs(b));
  }, [marcasDia, usuarioId]);

  const selectedUser = useMemo(
    () => usuariosConMarcas.find((u) => u.id === usuarioId) || null,
    [usuariosConMarcas, usuarioId]
  );

  const cargarMarcas = async (diaSeleccionado) => {
    setLoading(true);
    setError("");
    setMarcasDia([]);
    setUsuarioId("");

    try {
      const marcasRef = collection(
        db,
        "controlMarcas",
        diaSeleccionado,
        "marcas"
      );
      const qMarcas = query(marcasRef, orderBy("createdAt", "asc"));
      const snap = await getDocs(qMarcas);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setMarcasDia(
        filterByUserScope(rows, profile?.tenantId, profile?.company)
      );
    } catch (err) {
      console.error("Error cargando historial de marcas:", err);
      setError("No se pudo cargar el historial de marcas para ese dia.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    cargarMarcas(dia);
  }, [authLoading, dia, profile?.tenantId, profile?.company]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-cm", "historial-marcas");
    style.innerHTML = `
      @keyframes hm-spin { to { transform: rotate(360deg); } }
      .hm-input:focus {
        border-color: rgba(8, 159, 138, 0.45) !important;
        box-shadow: 0 0 0 4px rgba(8, 159, 138, 0.12);
      }
      @media (max-width: 760px) {
        .hm-filters { grid-template-columns: 1fr !important; }
        .hm-topbar { align-items: flex-start !important; flex-direction: column !important; height: auto !important; }
        .hm-topbar-actions { width: 100%; justify-content: flex-start !important; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div style={ui.shell}>
      <Topbar>
        <Brand
          icon={History}
          title="Historial de marcas"
          subtitle="Control de marcas"
          onClick={() => nav("/salud/control-marcas")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/salud/control-marcas")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <main style={ui.main}>
        <section style={ui.card}>
          <div style={ui.topAccent} />
          <div style={ui.cardHead}>
            <div>
              <div style={ui.kicker}>Historial de marcas</div>
              <h1 style={ui.title}>Consultar marcas por dia y usuario</h1>
              <p style={ui.desc}>
                Selecciona un dia y despues un usuario. El selector solo muestra
                personas con marcas registradas en esa fecha.
              </p>
            </div>
            <div style={ui.countBox}>
              <span style={ui.countValue}>{marcasDia.length}</span>
              <span style={ui.countLabel}>marcas del dia</span>
            </div>
          </div>

          <div className="hm-filters" style={ui.filters}>
            <label style={ui.field}>
              <span style={ui.label}>1. Dia</span>
              <input
                className="hm-input"
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value || getTodayId())}
                style={ui.input}
                disabled={loading}
              />
            </label>

            <label style={ui.field}>
              <span style={ui.label}>2. Usuario</span>
              <select
                className="hm-input"
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                style={ui.input}
                disabled={loading || usuariosConMarcas.length === 0}
              >
                <option value="">
                  {usuariosConMarcas.length === 0
                    ? "Sin usuarios con marcas"
                    : "Seleccionar usuario"}
                </option>
                {usuariosConMarcas.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} - {u.cedula || "Sin cedula"} ({u.count})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <div style={ui.errorBox}>{error}</div>}

          <div style={ui.resultsHead}>
            <div>
              <div style={ui.resultsKicker}>{dia}</div>
              <div style={ui.resultsTitle}>
                {selectedUser
                  ? `${selectedUser.nombre} - ${marcasUsuario.length} marcas`
                  : "Marcas del usuario seleccionado"}
              </div>
            </div>
            {loading && (
              <div style={ui.loadingPill}>
                <span style={ui.spinner} />
                Cargando
              </div>
            )}
          </div>

          <div style={ui.list}>
            {!loading && marcasDia.length === 0 ? (
              <div style={ui.empty}>
                No hay marcas registradas para el dia seleccionado.
              </div>
            ) : !usuarioId ? (
              <div style={ui.empty}>
                Selecciona un usuario para ver todas sus marcas de ese dia.
              </div>
            ) : marcasUsuario.length === 0 ? (
              <div style={ui.empty}>
                No hay marcas para el usuario seleccionado.
              </div>
            ) : (
              marcasUsuario.map((marca, index) => {
                const esEntrada = marca.tipo === "entrada";
                return (
                  <article key={marca.id} style={ui.row}>
                    <div style={ui.rowIndex}>{index + 1}</div>
                    <div style={ui.rowMain}>
                      <div style={ui.rowTop}>
                        <div style={ui.rowName}>
                          {marca.nombre || selectedUser?.nombre || "Sin nombre"}
                        </div>
                        <span
                          style={{
                            ...ui.badge,
                            ...(esEntrada ? ui.badgeEntrada : ui.badgeSalida),
                          }}
                        >
                          {esEntrada ? "ENTRADA" : "SALIDA"}
                        </span>
                      </div>
                      <div style={ui.meta}>
                        Cédula: {marca.cedula || "Sin cédula"} · Empresa:{" "}
                        {marca.empresa || marca.company || "Sin empresa"}
                      </div>
                      <div style={ui.meta}>Hora: {formatDateTime(marca)}</div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    height: "100dvh",
    width: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflow: "hidden",
  },
  main: {
    minHeight: 0,
    padding: 16,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    width: "min(1100px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    position: "relative",
  },
  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  cardHead: {
    padding: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    borderBottom: "1px solid #EEF1F7",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 980,
    letterSpacing: -0.4,
  },
  desc: {
    margin: "8px 0 0",
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.45,
    maxWidth: 620,
  },
  countBox: {
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "12px 16px",
    display: "grid",
    gap: 2,
    minWidth: 150,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  countValue: {
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 980,
    color: "#0F172A",
  },
  countLabel: {
    fontWeight: 900,
    color: "#64748B",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filters: {
    padding: 18,
    display: "grid",
    gridTemplateColumns: "220px minmax(260px, 1fr)",
    gap: 14,
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
  },
  field: { display: "grid", gap: 8 },
  label: {
    fontWeight: 980,
    fontSize: 12,
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    height: 44,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "0 12px",
    outline: "none",
    color: "#0F172A",
    fontWeight: 850,
    boxSizing: "border-box",
    width: "100%",
  },
  errorBox: {
    margin: "14px 18px 0",
    borderRadius: 16,
    border: "1px solid rgba(220,38,38,0.22)",
    background: "rgba(220,38,38,0.06)",
    padding: 12,
    color: DANGER,
    fontWeight: 900,
  },
  resultsHead: {
    padding: "14px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  resultsKicker: {
    color: "#64748B",
    fontWeight: 950,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  resultsTitle: {
    marginTop: 4,
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },
  loadingPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "8px 12px",
    fontWeight: 950,
    color: "#64748B",
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 999,
    border: "2px solid rgba(8,159,138,0.25)",
    borderTopColor: ACCENT,
    animation: "hm-spin 900ms linear infinite",
  },
  list: {
    padding: "0 18px 18px",
    display: "grid",
    gap: 10,
  },
  empty: {
    padding: 18,
    borderRadius: 16,
    border: "1px dashed #E7E9F2",
    background: "#FBFCFF",
    color: "#64748B",
    fontWeight: 850,
    textAlign: "center",
  },
  row: {
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    display: "grid",
    gridTemplateColumns: "42px 1fr",
    gap: 12,
    alignItems: "start",
  },
  rowIndex: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    fontWeight: 980,
  },
  rowMain: { display: "grid", gap: 7, minWidth: 0 },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  rowName: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },
  meta: {
    fontSize: 13,
    fontWeight: 850,
    color: "#64748B",
    lineHeight: 1.35,
  },
  badge: {
    fontSize: 11,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  badgeEntrada: {
    backgroundColor: "rgba(8,159,138,0.12)",
    color: ACCENT,
  },
  badgeSalida: {
    backgroundColor: "rgba(220,38,38,0.12)",
    color: DANGER,
  },
};
