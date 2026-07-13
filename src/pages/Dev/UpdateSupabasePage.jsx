import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Database, Loader2, RefreshCw, XCircle } from "lucide-react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { supabase } from "../../supabase";
import { AuthCtx } from "../../auth/AuthProvider";

const T = {
  accent: "#089F8A",
  accentSoft: "rgba(8, 159, 138, 0.10)",
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E5E9F0",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/* ─── Helpers ─── */
function toISOSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.toMillis === "function") return new Date(value.toMillis()).toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export default function UpdateSupabasePage() {
  const nav = useNavigate();
  const { role, profile } = useContext(AuthCtx);

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null); // { success, upserted, skipped, errors, message }
  const [logs, setLogs] = useState([]);

  // Guard: only dev role
  useEffect(() => {
    if (role && role !== "dev") {
      nav("/areas");
    }
  }, [role, nav]);

  const addLog = (msg, type = "info") => {
    setLogs((prev) => [...prev, { msg, type, ts: Date.now() }]);
  };

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setLogs([]);

    try {
      addLog("Leyendo acciones de descarga desde Firestore…");

      // 1. Fetch accion_descarga from Firestore (scoped al tenant/company del dev).
      // Reglas (sameTenantScopeData) exigen filtrar por tenantId+company. Índice compuesto:
      // accion_descarga (tenantId, company, creadoAt DESC) — ver firestore.indexes.json.
      const q = query(
        collection(db, "accion_descarga"),
        where("tenantId", "==", String(profile?.tenantId || "")),
        where("company", "==", String(profile?.company || "")),
        orderBy("creadoAt", "desc")
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      addLog(`Se encontraron ${docs.length} acciones en Firestore.`);

      // Filtrar solo finalizadas (con completedAt o completeAt)
      const completed = docs.filter((d) => d.completedAt || d.completeAt);
      addLog(`${completed.length} acciones finalizadas (con completedAt).`);

      // Filtrar solo las del tenant actual
      const tenantId = profile?.tenantId || "";
      const tenantFiltered = completed.filter((d) => d.tenantId === tenantId);
      addLog(`${tenantFiltered.length} pertenecen al tenant actual (${tenantId}).`);

      if (tenantFiltered.length === 0) {
        setResult({ success: true, upserted: 0, skipped: completed.length, errors: 0, message: "No hay acciones finalizadas para este tenant." });
        setSyncing(false);
        return;
      }

      // 2. Map to Supabase schema
      const rows = tenantFiltered.map((doc) => ({
        id: doc.id, // Firestore doc ID as primary key for upsert
        proveedor: doc.proveedorNombre || null,
        tipo: doc.tipo || null, // EPA / COFERSA
        started_at: toISOSafe(doc.startedAt) || null,
        completed_at: toISOSafe(doc.completedAt ?? doc.completeAt) || null,
        tipo_descarga: doc.tipoDescarga || null,
        cantidad_bultos: doc.cantidadBultos ? Number(doc.cantidadBultos) : null,
        id_anden: doc.idAnden || null,
        apertura_id: doc.aperturaId || null,
        creado_at: toISOSafe(doc.creadoAt) || null,
        creado_por: doc.creadoPorNombre || null,
        tenant_id: doc.tenantId || null,
        company: doc.company || null,
        updated_at: new Date().toISOString(),
      }));

      addLog("Enviando upsert a Supabase (por lotes de 500)…");

      // 3. Upsert in batches of 500
      const BATCH_SIZE = 500;
      let upserted = 0;
      let errors = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from("acciones_descarga")
          .upsert(batch, { onConflict: "id" });

        if (error) {
          addLog(`Error en lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`, "error");
          errors += batch.length;
        } else {
          upserted += batch.length;
          addLog(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} registros sincronizados.`, "success");
        }
      }

      const msg = errors > 0
        ? `Sincronización parcial: ${upserted} actualizados, ${errors} con error.`
        : `Sincronización completa: ${upserted} registros actualizados en Supabase.`;

      addLog(msg, errors > 0 ? "warn" : "success");
      setResult({ success: errors === 0, upserted, skipped: 0, errors, message: msg });
    } catch (err) {
      addLog(`Error inesperado: ${err.message}`, "error");
      setResult({ success: false, upserted: 0, skipped: 0, errors: 1, message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={styles.shell}>
      {/* Header */}
      <header style={styles.header}>
        <button
          type="button"
          onClick={() => nav("/dev")}
          style={styles.backBtn}
          aria-label="Volver a Dev Hub"
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div>
          <h1 style={styles.title}>Update AppOLO Supabase</h1>
          <p style={styles.subtitle}>
            Sincroniza acciones de descarga de Firestore → Supabase (upsert por ID, sin duplicados)
          </p>
        </div>
      </header>

      <main style={styles.main}>
        {/* Action card */}
        <div style={styles.actionCard}>
          <div style={styles.actionIcon}>
            <Database size={24} strokeWidth={2} />
          </div>
          <div style={styles.actionBody}>
            <h2 style={styles.actionTitle}>Acciones de Descarga</h2>
            <p style={styles.actionDesc}>
              Lee todas las acciones de descarga desde Firestore y las envía a la tabla{" "}
              <code style={styles.code}>acciones_descarga</code> en Supabase. Los registros
              existentes se actualizan (upsert por ID), evitando duplicados.
            </p>
            <p style={styles.actionFields}>
              <strong>Campos:</strong> proveedor, tipo (EPA/COFERSA), started_at, completed_at,
              tipo_descarga, cantidad_bultos, id_anden, apertura_id, creado_at, creado_por, tenant_id, company
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            style={{
              ...styles.syncBtn,
              ...(syncing ? styles.syncBtnDisabled : {}),
            }}
          >
            {syncing ? (
              <Loader2 size={18} strokeWidth={2.2} style={{ animation: "spin 0.7s linear infinite" }} />
            ) : (
              <RefreshCw size={18} strokeWidth={2.2} />
            )}
            <span>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</span>
          </button>
        </div>

        {/* Result banner */}
        {result && (
          <div
            style={{
              ...styles.resultBanner,
              borderColor: result.success ? "#10B981" : "#EF4444",
              background: result.success ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
            }}
          >
            {result.success ? (
              <CheckCircle size={20} strokeWidth={2} color="#10B981" />
            ) : (
              <XCircle size={20} strokeWidth={2} color="#EF4444" />
            )}
            <span style={styles.resultText}>{result.message}</span>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div style={styles.logsCard}>
            <h3 style={styles.logsTitle}>Log de sincronización</h3>
            <div style={styles.logsList}>
              {logs.map((l, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.logLine,
                    color:
                      l.type === "error"
                        ? "#EF4444"
                        : l.type === "success"
                        ? "#10B981"
                        : l.type === "warn"
                        ? "#F59E0B"
                        : T.textSecondary,
                  }}
                >
                  <span style={styles.logTime}>
                    {new Date(l.ts).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SQL hint */}
        <div style={styles.hintCard}>
          <h3 style={styles.hintTitle}>Tabla requerida en Supabase</h3>
          <pre style={styles.pre}>{sqlHint}</pre>
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const sqlHint = `CREATE TABLE acciones_descarga (
  id TEXT PRIMARY KEY,           -- Firestore doc ID
  proveedor TEXT,
  tipo TEXT,                     -- EPA / COFERSA
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tipo_descarga TEXT,
  cantidad_bultos INTEGER,
  id_anden TEXT,
  apertura_id TEXT,
  creado_at TIMESTAMPTZ,
  creado_por TEXT,
  tenant_id TEXT,
  company TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`;

const styles = {
  shell: {
    minHeight: "100vh",
    background: T.bg,
    fontFamily: T.font,
    color: T.text,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "24px 24px 16px",
    maxWidth: 900,
    margin: "0 auto",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.text,
    flexShrink: 0,
    fontFamily: "inherit",
    padding: 0,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 850,
    letterSpacing: -0.4,
    lineHeight: 1.2,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    color: T.textSecondary,
    marginTop: 2,
    lineHeight: 1.4,
  },
  main: {
    padding: "0 24px 48px",
    maxWidth: 900,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  actionCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "20px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 16,
    boxShadow: T.shadow,
    flexWrap: "wrap",
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  actionBody: {
    flex: 1,
    minWidth: 200,
  },
  actionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: T.text,
  },
  actionDesc: {
    margin: "6px 0 0",
    fontSize: 13,
    fontWeight: 500,
    color: T.textSecondary,
    lineHeight: 1.5,
  },
  actionFields: {
    margin: "8px 0 0",
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.5,
  },
  code: {
    background: T.surfaceAlt,
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "monospace",
  },
  syncBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    borderRadius: 12,
    border: "none",
    background: T.accent,
    color: "#fff",
    fontWeight: 750,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 150ms ease",
    whiteSpace: "nowrap",
    alignSelf: "center",
  },
  syncBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  resultBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    borderRadius: 12,
    border: "1px solid",
  },
  resultText: {
    fontSize: 14,
    fontWeight: 650,
    color: T.text,
  },
  logsCard: {
    padding: "16px 18px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    boxShadow: T.shadow,
  },
  logsTitle: {
    margin: "0 0 10px",
    fontSize: 14,
    fontWeight: 750,
    color: T.text,
  },
  logsList: {
    display: "grid",
    gap: 4,
    maxHeight: 240,
    overflow: "auto",
  },
  logLine: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.5,
    fontFamily: "monospace",
  },
  logTime: {
    fontSize: 11,
    color: T.textMuted,
    flexShrink: 0,
  },
  hintCard: {
    padding: "16px 18px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    boxShadow: T.shadow,
  },
  hintTitle: {
    margin: "0 0 10px",
    fontSize: 14,
    fontWeight: 750,
    color: T.text,
  },
  pre: {
    margin: 0,
    padding: "14px",
    background: "#1E293B",
    color: "#E2E8F0",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: "monospace",
    overflow: "auto",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
};
