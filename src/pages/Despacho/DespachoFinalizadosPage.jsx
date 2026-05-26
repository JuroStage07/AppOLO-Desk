import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import { ArrowLeft, CheckCircle2, Loader2, Truck } from "lucide-react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import useIsMobile from "../../hooks/useIsMobile";
import {
  Brand,
  GhostButton,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const SLATE = "#64748B";

/** Estados considerados cerrados (ajustá según lo que escriba el backend al cerrar). */
const ESTADOS_FINALIZADOS = ["finalizado", "cerrado", "completado"];

function fmtTs(ts) {
  try {
    if (ts?.toDate) return ts.toDate().toLocaleString("es-CR");
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString("es-CR");
  } catch {
    /* ignore */
  }
  return "—";
}

function FinalizadoRow({ row }) {
  return (
    <div style={ui.rowCard}>
      <div style={ui.rowTop}>
        <div style={ui.rowTitle}>{row.referencia || "Sin referencia"}</div>
        <span style={ui.estadoPill}>{row.estado || "—"}</span>
      </div>
      <div style={ui.rowMeta}>
        Tienda: <b>{row.tienda || "—"}</b>
        <span style={ui.dot}>·</span>
        Placa: <b>{row.placa || "—"}</b>
      </div>
      <div style={ui.rowDates}>
        <span>Cierre / actualización: {fmtTs(row.closedAt || row.finalizadoAt || row.updatedAt)}</span>
        <span style={ui.dot}>·</span>
        <span>Creado: {fmtTs(row.createdAt)}</span>
      </div>
    </div>
  );
}

export default function DespachoFinalizadosPage() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const isMobile = useIsMobile();

  const [tenantScope, setTenantScope] = useState({ tenantId: "", company: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let unsub = () => {};

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
          where("estado", "in", ESTADOS_FINALIZADOS),
          orderBy("createdAt", "desc"),
          limit(200)
        );

        unsub = onSnapshot(
          q,
          (snap) => {
            setRows(
              snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }))
            );
            setLoading(false);
          },
          (err) => {
            console.error("despachos finalizados:", err);
            setError(
              err?.message?.includes("index")
                ? "Falta índice en Firestore para esta consulta. Revisá la consola o creá el índice compuesto sugerido."
                : err?.message || "No se pudieron cargar los despachos finalizados."
            );
            setLoading(false);
          }
        );
      } catch (e) {
        console.error(e);
        setError("No se pudieron cargar los despachos finalizados.");
        setLoading(false);
      }
    }

    boot();
    return () => unsub();
  }, []);

  return (
    <div style={{ ...ui.shell, ...(isMobile ? ui.mShell : {}) }}>
      <Topbar>
        <Brand
          icon={CheckCircle2}
          title="Despachos"
          subtitle="Historial de cierres"
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
              <h1 style={ui.title}>Despachos finalizados</h1>
              <p style={ui.subtitle}>
                Listado de despachos con estado finalizado, cerrado o completado (últimos 200 por fecha de
                creación).
              </p>
            </div>
            <div style={ui.heroMeta}>
              <div>
                <b>Tenant:</b> {tenantScope.tenantId || "—"}
              </div>
              <div>
                <b>Company:</b> {tenantScope.company || "—"}
              </div>
            </div>
          </div>

          {loading && (
            <div style={ui.infoBanner}>
              <span style={ui.btnInlineIcon}>
                <Loader2 size={18} style={{ animation: "despFinSpin 0.8s linear infinite" }} />
                Cargando…
              </span>
            </div>
          )}

          {!!error && !loading && <div style={ui.errorBanner}>{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div style={ui.emptyCard}>
              <Truck size={22} color={SLATE} />
              <div style={ui.emptyTitle}>No hay despachos finalizados</div>
              <div style={ui.emptyText}>
                No se encontraron documentos con estado {ESTADOS_FINALIZADOS.join(", ")}. Si usás otro valor
                al cerrar, actualizá la constante en el código o en Firestore.
              </div>
            </div>
          )}

          <div style={ui.list}>
            {!loading &&
              !error &&
              rows.map((row) => <FinalizadoRow key={row.id} row={row} />)}
          </div>
        </div>
      </main>

      <style>{`
        @keyframes despFinSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
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
  brand: { display: "flex", alignItems: "center", gap: 12 },
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
  topbarRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
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
    fontFamily: "inherit",
  },
  btnInlineIcon: { display: "inline-flex", alignItems: "center", gap: 8 },
  main: { padding: "18px 16px 28px" },
  container: { width: "100%", maxWidth: 1120, margin: "0 auto", display: "grid", gap: 16 },
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
  title: { margin: 0, fontSize: 28, fontWeight: 950 },
  subtitle: { margin: "8px 0 0", color: SLATE, fontWeight: 600, maxWidth: 720 },
  heroMeta: { fontSize: 13, color: SLATE, display: "grid", gap: 6 },
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
  emptyText: { color: SLATE, fontSize: 13, textAlign: "center", maxWidth: 520 },
  list: { display: "grid", gap: 12 },
  rowCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 6px 18px rgba(15,23,42,0.04)",
  },
  rowTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: 900 },
  estadoPill: {
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.04,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    flexShrink: 0,
  },
  rowMeta: { marginTop: 8, fontSize: 13, color: SLATE },
  rowDates: { marginTop: 6, fontSize: 12, color: "#94A3B8", display: "flex", flexWrap: "wrap", gap: 6 },
  dot: { opacity: 0.6 },
};
