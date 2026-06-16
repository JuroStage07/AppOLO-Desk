import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, RefreshCw, Settings, Users } from "lucide-react";
import { collection, doc, getDocs, orderBy, query, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../firebase";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  Main,
  Shell,
  Spinner,
  Topbar,
} from "../../components/ui";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  RADIUS_LG,
  RADIUS_2XL,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  TEXT,
  SURFACE_INSET,
  SPACE_4,
  SPACE_6,
  SPACE_8,
  FS_XS,
  FS_SM,
  FS_BASE,
  FS_LG,
  FW_BOLD,
  FW_EXTRABOLD,
  RADIUS_PILL,
} from "../../styles/theme";

/* ─── Styles ─── */
const styles = {
  section: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_2XL,
    boxShadow: SHADOW_CARD,
    padding: SPACE_8,
    display: "grid",
    gap: SPACE_6,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS_LG,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: FS_LG,
    fontWeight: FW_EXTRABOLD,
    color: TEXT,
  },
  sectionSubtitle: {
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    color: SLATE,
    marginTop: 2,
  },
  syncBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    border: "none",
    borderRadius: RADIUS_PILL,
    background: ACCENT,
    color: "#fff",
    fontSize: FS_SM,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    transition: "opacity 0.15s",
    boxShadow: `0 4px 14px rgba(8,159,138,0.25)`,
  },
  syncBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  statusMsg: {
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    color: ACCENT,
    textAlign: "center",
    padding: "8px 0",
  },
  errorMsg: {
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    color: "#B91C1C",
    textAlign: "center",
    padding: "8px 0",
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: RADIUS_LG,
    border: `1px solid ${BORDER}`,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
  },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    background: SURFACE_INSET,
    color: SLATE,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    whiteSpace: "nowrap",
  },
  placeholder: {
    background: SURFACE_INSET,
    border: `1px dashed ${BORDER}`,
    borderRadius: RADIUS_LG,
    padding: `${SPACE_8}px ${SPACE_4}px`,
    textAlign: "center",
    display: "grid",
    gap: 8,
    placeItems: "center",
  },
  placeholderText: {
    fontSize: FS_BASE,
    fontWeight: FW_BOLD,
    color: SLATE,
  },
  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: RADIUS_PILL,
    background: ACCENT_SOFT,
    color: ACCENT,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
  },
};

/* ─── Page ─── */
export default function OvertimeUsersAdmin() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "overtimeUsers"), orderBy("fullName"));
      const snap = await getDocs(q);
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching overtimeUsers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSync = async () => {
    setSyncing(true);
    setStatus(null);
    setError(null);
    try {
      // 1. Fetch employees from bit2-api
      const API_URL = String(import.meta.env.VITE_OVERTIME_API_URL || "").replace(/\/$/, "");
      if (!API_URL) throw new Error("VITE_OVERTIME_API_URL no está configurada.");

      const user = auth.currentUser;
      if (!user) throw new Error("No hay sesión activa.");
      const token = await user.getIdToken();

      const res = await fetch(`${API_URL}/overtime/users-sync`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("users-sync response:", data);

      if (!res.ok || !data.ok) {
        setError(data.error || data.message || "Error al obtener usuarios de Bit2.");
        return;
      }

      const employees = data.employees || [];
      if (employees.length === 0) {
        setError("No se encontraron empleados en Bit2.");
        return;
      }

      // 2. Write to Firestore overtimeUsers collection (batch)
      let synced = 0;
      const BATCH_SIZE = 450;
      for (let i = 0; i < employees.length; i += BATCH_SIZE) {
        const chunk = employees.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const emp of chunk) {
          const docRef = doc(db, "overtimeUsers", String(emp.idEmployee));
          batch.set(docRef, {
            idEmployee: Number(emp.idEmployee),
            fullName: (emp.fullName || "").trim(),
            codeEmployee: (emp.codeEmployee || "").trim(),
            department: (emp.nameDepartament || "").trim(),
            jobPosition: (emp.nameJobPosition || "").trim(),
            groupId: emp.idGroup ? Number(emp.idGroup) : null,
            coordinatorName: (emp.nameGroup || "").trim(),
            groupCode: (emp.codeGroup || "").trim(),
            syncedAt: serverTimestamp(),
            syncedBy: user.email || "system",
          }, { merge: true });
          synced++;
        }
        await batch.commit();
      }

      setStatus(`Sincronización completada: ${synced} usuarios sincronizados.`);
      fetchUsers();
    } catch (err) {
      console.error("Sync error:", err);
      setError(err.message || "Error al sincronizar con Bit2.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Settings}
          title="Gestión de Usuarios"
          subtitle="Horas Extra · Parámetros"
          onClick={() => nav("/horas-extra/usuarios")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Administración
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Horas Extra"
            title="Gestión de Usuarios"
            subtitle="Configurá parámetros de usuario para el módulo de horas extra: límites, autorizaciones y reglas."
            badge={<Badge icon={Clock}>Horas Extra</Badge>}
          />

          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionHeaderLeft}>
                <div style={styles.sectionIcon}>
                  <Users size={20} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={styles.sectionTitle}>
                    Usuarios configurados
                    {users.length > 0 && (
                      <span style={{ ...styles.countBadge, marginLeft: 10 }}>
                        {users.length}
                      </span>
                    )}
                  </div>
                  <div style={styles.sectionSubtitle}>
                    Usuarios importados desde el reloj biométrico (Bit2)
                  </div>
                </div>
              </div>

              <button
                type="button"
                style={{
                  ...styles.syncBtn,
                  ...(syncing ? styles.syncBtnDisabled : {}),
                }}
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw
                  size={15}
                  strokeWidth={2.4}
                  style={{
                    animation: syncing ? "spin 1s linear infinite" : "none",
                  }}
                />
                {syncing ? "Sincronizando..." : "Sync desde Bit2"}
              </button>
            </div>

            {status && <div style={styles.statusMsg}>{status}</div>}
            {error && <div style={styles.errorMsg}>{error}</div>}

            {loading ? (
              <div style={{ textAlign: "center", padding: 32 }}>
                <Spinner />
              </div>
            ) : users.length === 0 ? (
              <div style={styles.placeholder}>
                <Users size={32} strokeWidth={1.6} color={SLATE} />
                <div style={styles.placeholderText}>
                  No hay usuarios sincronizados aún
                </div>
                <div style={{ fontSize: FS_SM, color: SLATE, maxWidth: 360 }}>
                  Presioná "Sync desde Bit2" para importar los usuarios desde el
                  sistema de reloj biométrico.
                </div>
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Código</th>
                      <th style={styles.th}>Nombre</th>
                      <th style={styles.th}>Puesto</th>
                      <th style={styles.th}>Departamento</th>
                      <th style={styles.th}>Coordinador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={styles.td}>{u.codeEmployee || "—"}</td>
                        <td style={styles.td}>{u.fullName || "—"}</td>
                        <td style={styles.td}>{u.jobPosition || "—"}</td>
                        <td style={styles.td}>{u.department || "—"}</td>
                        <td style={styles.td}>{u.coordinatorName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Container>
      </Main>

      {/* Spin animation for the sync icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Shell>
  );
}
