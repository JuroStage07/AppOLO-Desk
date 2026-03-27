import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";

const ACCENT = "#089F8A";

/** Debe coincidir con el valor que guardes al cerrar una OT en Firestore. */
export const OT_STATE_FINALIZADA = "Finalizada";

export default function OTsFinalizadasPage() {
  const nav = useNavigate();
  const { permisos, loading } = useContext(AuthCtx);

  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!permisos?.mantenimiento) {
      alert("Este usuario no puede acceder por falta de permisos.");
      nav(-1);
    }
  }, [loading, permisos, nav]);

  useEffect(() => {
    if (!permisos?.mantenimiento) return;

    const q = query(
      collection(db, "solicitudesOT"),
      where("OTState", "==", OT_STATE_FINALIZADA)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
          const tb = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setItems(rows);
        setLoadError("");
        setListLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError(
          "No se pudo cargar el listado. Si falta un índice compuesto en Firestore, creá uno para solicitudesOT (OTState + updatedAt) o revisá las reglas."
        );
        setListLoading(false);
      }
    );

    return () => unsub();
  }, [permisos?.mantenimiento]);

  if (!permisos?.mantenimiento) return null;

  return (
    <div style={ui.shell}>
      <div style={ui.topbar}>
        <button
          type="button"
          style={ui.btnGhost}
          onClick={() => nav("/mantenimiento/ots")}
        >
          <ArrowLeft size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Órdenes de trabajo
        </button>

        <div style={ui.topbarRight}>
          <button type="button" style={ui.btnGhost} onClick={() => nav("/mantenimiento")}>
            Mantenimiento
          </button>
          <button
            type="button"
            style={ui.btnGhost}
            onClick={() => void signOut(auth)}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={ui.main}>
        <div style={ui.container}>
          <div style={ui.head}>
            <div style={ui.kicker}>
              <ClipboardList size={18} color={ACCENT} />
              <span>OT finalizadas</span>
            </div>
            <h1 style={ui.title}>Órdenes cerradas</h1>
            <p style={ui.sub}>
              Solicitudes con <code style={ui.code}>OTState: &quot;{OT_STATE_FINALIZADA}&quot;</code>
            </p>
          </div>

          {listLoading ? (
            <div style={ui.empty}>Cargando…</div>
          ) : loadError ? (
            <div style={{ ...ui.empty, color: "#B42318" }}>{loadError}</div>
          ) : items.length === 0 ? (
            <div style={ui.empty}>
              No hay OT finalizadas todavía. Cuando marques una orden como cerrada en
              el flujo, aparecerá aquí.
            </div>
          ) : (
            <ul style={ui.list}>
              {items.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    style={ui.rowBtn}
                    onClick={() => nav(`/mantenimiento/ots-solicitud/${row.id}`)}
                  >
                    <div style={ui.rowTop}>
                      <span style={ui.nro}>{row.NroSolicitud || row.id}</span>
                      <span style={ui.badge}>{OT_STATE_FINALIZADA}</span>
                    </div>
                    <div style={ui.otName}>{row.nombreOT || "Sin nombre"}</div>
                    <div style={ui.meta}>
                      {(row.activoReferencia || "—") +
                        (row.departamento ? ` · ${row.departamento}` : "")}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  topbar: {
    padding: "12px 16px",
    borderBottom: "1px solid #E7E9F2",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  topbarRight: { display: "flex", gap: 10, flexWrap: "wrap" },
  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#0F172A",
  },
  main: { padding: 20, display: "grid", justifyContent: "center" },
  container: { width: "min(720px, 100%)", display: "grid", gap: 16 },
  head: { display: "grid", gap: 8 },
  kicker: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: ACCENT,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 980 },
  sub: { margin: 0, color: "#64748B", fontWeight: 700, fontSize: 14 },
  code: {
    fontSize: 12,
    background: "#EEF2F7",
    padding: "2px 6px",
    borderRadius: 6,
  },
  empty: {
    padding: 28,
    textAlign: "center",
    color: "#64748B",
    fontWeight: 700,
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 10,
  },
  rowBtn: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 14,
    background: "#fff",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  nro: { fontWeight: 950, color: "#4F46E5", fontSize: 14 },
  badge: {
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.1,
    color: ACCENT,
    background: "rgba(8,159,138,0.12)",
    padding: "4px 8px",
    borderRadius: 8,
  },
  otName: { fontWeight: 800, fontSize: 15, color: "#0F172A" },
  meta: { marginTop: 4, fontSize: 12, color: "#64748B", fontWeight: 700 },
};
