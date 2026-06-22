import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Briefcase, Building2, CalendarClock, Check, ChevronDown, ChevronRight, Clock, RefreshCw, RotateCcw, Settings, UserCheck, UserCog, UserMinus, Users, UserX } from "lucide-react";
import { collection, deleteField, doc, getDocs, orderBy, query, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../firebase";
import {
  Badge,
  Brand,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  PrimaryButton,
  Sheet,
  Shell,
  Spinner,
  Topbar,
  useConfirm,
  useToast,
} from "../../../components/ui";
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
} from "../../../styles/theme";

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
  headerActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  excludedBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    fontSize: FS_SM,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
  },
  rowBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: "#B91C1C",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  rowBtnReinclude: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: ACCENT,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  thCenter: {
    textAlign: "center",
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
  tdCenter: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  excludedCountBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    padding: "1px 7px",
    borderRadius: RADIUS_PILL,
    background: "#FEE2E2",
    color: "#B91C1C",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
  },
  nameToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: 0,
    border: "none",
    background: "none",
    color: TEXT,
    fontSize: FS_SM,
    fontWeight: FW_EXTRABOLD,
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "left",
  },
  detailCell: {
    padding: "0 14px 12px",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_INSET,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
    gap: 10,
    paddingTop: 12,
  },
  detailItem: {
    display: "grid",
    gap: 4,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    padding: "8px 12px",
  },
  detailLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: SLATE,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    color: TEXT,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
  },
  overrideBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: RADIUS_PILL,
    background: "rgba(124,58,237,0.10)",
    color: "#7C3AED",
    border: "1px solid rgba(124,58,237,0.25)",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    whiteSpace: "nowrap",
  },
  scheduleEditor: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px dashed ${BORDER}`,
    display: "grid",
    gap: 8,
  },
  scheduleEditorHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  scheduleHint: {
    fontSize: FS_XS,
    fontWeight: FW_BOLD,
    color: SLATE,
  },
  scheduleControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  scheduleSelect: {
    appearance: "none",
    WebkitAppearance: "none",
    padding: "8px 12px",
    borderRadius: RADIUS_LG,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    fontFamily: "inherit",
    cursor: "pointer",
    minWidth: 240,
    maxWidth: "100%",
  },
  assignBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: RADIUS_PILL,
    border: "none",
    background: ACCENT,
    color: "#fff",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  revertBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: SLATE,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

/* ─── Helpers ─── */
// Horario efectivo: override de Firestore si existe, si no el de Bit2.
function effectiveSchedule(u) {
  if (u.overrideScheduleId != null) {
    return {
      id: u.overrideScheduleId,
      name: u.overrideScheduleName || "",
      range: u.overrideScheduleRange || "",
      overridden: true,
    };
  }
  return {
    id: u.scheduleId ?? null,
    name: u.scheduleName || "",
    range: u.scheduleRange || "",
    overridden: false,
  };
}

// Copia del usuario sin los campos de override (para reflejar el borrado local).
function stripScheduleOverride(u) {
  const copy = { ...u };
  delete copy.overrideScheduleId;
  delete copy.overrideScheduleName;
  delete copy.overrideScheduleRange;
  delete copy.overrideScheduleBy;
  delete copy.overrideScheduleAt;
  return copy;
}

/* ─── Page ─── */
export default function OvertimeUsersAdmin() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [scheduleSel, setScheduleSel] = useState({}); // { [userId]: selectedScheduleId }

  const toggleExpanded = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const activeUsers = useMemo(() => users.filter((u) => !u.excluded), [users]);
  const excludedUsers = useMemo(() => users.filter((u) => u.excluded), [users]);

  // Catálogo de turnos disponibles: derivado de los horarios presentes en los
  // usuarios sincronizados (no requiere endpoint nuevo).
  const scheduleCatalog = useMemo(() => {
    const m = new Map();
    const add = (id, name, range) => {
      if (id == null || m.has(id)) return;
      m.set(id, { id, name: name || `Horario ${id}`, range: range || "" });
    };
    users.forEach((u) => {
      add(u.scheduleId, u.scheduleName, u.scheduleRange);
      add(u.overrideScheduleId, u.overrideScheduleName, u.overrideScheduleRange);
    });
    return Array.from(m.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }, [users]);

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

  const setExcluded = useCallback(
    async (u, excluded) => {
      setUpdatingId(u.id);
      try {
        await updateDoc(doc(db, "overtimeUsers", u.id), { excluded });
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, excluded } : x))
        );
        toast.success(
          excluded
            ? `${u.fullName || "Usuario"} excluido de horas extra.`
            : `${u.fullName || "Usuario"} reincluido.`
        );
      } catch (err) {
        console.error("Error updating exclusion:", err);
        toast.error("No se pudo actualizar la exclusión.");
      } finally {
        setUpdatingId(null);
      }
    },
    [toast]
  );

  const handleExclude = useCallback(
    async (u) => {
      const ok = await confirm({
        title: "Excluir usuario",
        message: `¿Excluir a ${u.fullName || "este usuario"} del módulo de horas extra? No aparecerá en los listados de aprobación.`,
        confirmText: "Excluir",
        cancelText: "Cancelar",
        tone: "danger",
      });
      if (!ok) return;
      setExcluded(u, true);
    },
    [confirm, setExcluded]
  );

  // Asigna un turno como override en Firestore. Si el turno elegido coincide con
  // el de Bit2, limpia el override (vuelve a seguir a Bit2). NO escribe en Bit2.
  const handleAssignSchedule = useCallback(
    async (u) => {
      const selId = scheduleSel[u.id] ?? effectiveSchedule(u).id;
      if (selId == null) return;
      const sched = scheduleCatalog.find((s) => s.id === selId);
      if (!sched) return;
      setUpdatingId(u.id);
      try {
        const followsBit2 = u.scheduleId != null && selId === u.scheduleId;
        const patch = followsBit2
          ? {
              overrideScheduleId: deleteField(),
              overrideScheduleName: deleteField(),
              overrideScheduleRange: deleteField(),
              overrideScheduleBy: deleteField(),
              overrideScheduleAt: deleteField(),
            }
          : {
              overrideScheduleId: sched.id,
              overrideScheduleName: sched.name,
              overrideScheduleRange: sched.range,
              overrideScheduleBy: auth.currentUser?.email || "system",
              overrideScheduleAt: serverTimestamp(),
            };
        await updateDoc(doc(db, "overtimeUsers", u.id), patch);
        setUsers((prev) =>
          prev.map((x) => {
            if (x.id !== u.id) return x;
            if (followsBit2) return stripScheduleOverride(x);
            return {
              ...x,
              overrideScheduleId: sched.id,
              overrideScheduleName: sched.name,
              overrideScheduleRange: sched.range,
            };
          })
        );
        toast.success(
          followsBit2
            ? `${u.fullName || "Usuario"}: vuelve al horario de Bit2.`
            : `${u.fullName || "Usuario"}: horario asignado a "${sched.name}".`
        );
      } catch (err) {
        console.error("Error asignando horario:", err);
        toast.error("No se pudo asignar el horario.");
      } finally {
        setUpdatingId(null);
      }
    },
    [scheduleSel, scheduleCatalog, toast]
  );

  const handleClearOverride = useCallback(
    async (u) => {
      setUpdatingId(u.id);
      try {
        await updateDoc(doc(db, "overtimeUsers", u.id), {
          overrideScheduleId: deleteField(),
          overrideScheduleName: deleteField(),
          overrideScheduleRange: deleteField(),
          overrideScheduleBy: deleteField(),
          overrideScheduleAt: deleteField(),
        });
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? stripScheduleOverride(x) : x))
        );
        setScheduleSel((prev) => {
          const next = { ...prev };
          delete next[u.id];
          return next;
        });
        toast.success(`${u.fullName || "Usuario"}: override quitado.`);
      } catch (err) {
        console.error("Error quitando override:", err);
        toast.error("No se pudo quitar el override.");
      } finally {
        setUpdatingId(null);
      }
    },
    [toast]
  );

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
            idDevice: emp.idDevice != null ? Number(emp.idDevice) : null,
            fullName: (emp.fullName || "").trim(),
            codeEmployee: (emp.codeEmployee || "").trim(),
            department: (emp.nameDepartament || "").trim(),
            jobPosition: (emp.nameJobPosition || "").trim(),
            groupId: emp.idGroup ? Number(emp.idGroup) : null,
            coordinatorName: (emp.nameGroup || "").trim(),
            groupCode: (emp.codeGroup || "").trim(),
            scheduleId: emp.idSchedule != null ? Number(emp.idSchedule) : null,
            scheduleCode: (emp.codeSchedule || "").trim(),
            scheduleName: (emp.scheduleName || "").trim(),
            scheduleRange: (emp.scheduleRange || "").trim(),
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
                    {activeUsers.length > 0 && (
                      <span style={{ ...styles.countBadge, marginLeft: 10 }}>
                        {activeUsers.length}
                      </span>
                    )}
                  </div>
                  <div style={styles.sectionSubtitle}>
                    Usuarios importados desde el reloj biométrico (Bit2)
                  </div>
                </div>
              </div>

              <div style={styles.headerActions}>
                <button
                  type="button"
                  style={styles.excludedBtn}
                  onClick={() => setExcludedOpen(true)}
                >
                  <UserX size={15} strokeWidth={2.4} />
                  Excluidos
                  <span style={styles.excludedCountBadge}>{excludedUsers.length}</span>
                </button>

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
            ) : activeUsers.length === 0 ? (
              <EmptyState
                icon={UserX}
                title="Todos los usuarios están excluidos"
                description="No hay usuarios activos. Revisá la lista de excluidos para reincluir alguno."
                action={
                  <PrimaryButton icon={UserX} onClick={() => setExcludedOpen(true)}>
                    Ver excluidos ({excludedUsers.length})
                  </PrimaryButton>
                }
              />
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>N° Ficha</th>
                      <th style={styles.th}>Nombre</th>
                      <th style={styles.th}>Horario</th>
                      <th style={styles.thCenter}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.map((u) => {
                      const isOpen = !!expanded[u.id];
                      const Chevron = isOpen ? ChevronDown : ChevronRight;
                      const eff = effectiveSchedule(u);
                      const selValue = scheduleSel[u.id] ?? (eff.id ?? "");
                      return (
                        <React.Fragment key={u.id}>
                          <tr>
                            <td style={styles.td}>{u.idDevice ?? "—"}</td>
                            <td style={styles.td}>
                              <button
                                type="button"
                                style={styles.nameToggle}
                                onClick={() => toggleExpanded(u.id)}
                                title={isOpen ? "Ocultar detalle" : "Ver detalle"}
                                aria-expanded={isOpen}
                              >
                                <Chevron size={15} strokeWidth={2.6} style={{ color: ACCENT, flexShrink: 0 }} />
                                <span>{u.fullName || "—"}</span>
                              </button>
                            </td>
                            <td style={styles.td}>
                              {eff.name || eff.range ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  <span>
                                    {eff.name || "—"}
                                    {eff.range ? (
                                      <span style={{ color: SLATE, fontWeight: FW_BOLD, marginLeft: 6 }}>
                                        ({eff.range})
                                      </span>
                                    ) : null}
                                  </span>
                                  {eff.overridden && (
                                    <span style={styles.overrideBadge} title="Horario asignado manualmente (override)">
                                      Override
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={styles.tdCenter}>
                              <button
                                type="button"
                                style={styles.rowBtn}
                                onClick={() => handleExclude(u)}
                                disabled={updatingId === u.id}
                                title="Excluir de horas extra"
                              >
                                <UserMinus size={13} strokeWidth={2.4} />
                                Excluir
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td style={styles.detailCell} colSpan={4}>
                                <div style={styles.detailGrid}>
                                  <div style={styles.detailItem}>
                                    <span style={styles.detailLabel}>
                                      <Briefcase size={13} strokeWidth={2.4} />
                                      Puesto
                                    </span>
                                    <span style={styles.detailValue}>{u.jobPosition || "—"}</span>
                                  </div>
                                  <div style={styles.detailItem}>
                                    <span style={styles.detailLabel}>
                                      <Building2 size={13} strokeWidth={2.4} />
                                      Departamento
                                    </span>
                                    <span style={styles.detailValue}>{u.department || "—"}</span>
                                  </div>
                                  <div style={styles.detailItem}>
                                    <span style={styles.detailLabel}>
                                      <UserCog size={13} strokeWidth={2.4} />
                                      Coordinador
                                    </span>
                                    <span style={styles.detailValue}>{u.coordinatorName || "—"}</span>
                                  </div>
                                </div>

                                <div style={styles.scheduleEditor}>
                                  <div style={styles.scheduleEditorHead}>
                                    <span style={styles.detailLabel}>
                                      <CalendarClock size={13} strokeWidth={2.4} />
                                      Asignar horario
                                    </span>
                                    <span style={styles.scheduleHint}>
                                      {eff.overridden
                                        ? "Override en AppoloDesk (no toca Bit2)."
                                        : "Sigue el horario de Bit2."}
                                    </span>
                                  </div>
                                  <div style={styles.scheduleControls}>
                                    <select
                                      value={selValue}
                                      onChange={(e) =>
                                        setScheduleSel((prev) => ({
                                          ...prev,
                                          [u.id]: Number(e.target.value),
                                        }))
                                      }
                                      style={styles.scheduleSelect}
                                      disabled={updatingId === u.id || scheduleCatalog.length === 0}
                                    >
                                      {scheduleCatalog.length === 0 && <option value="">Sin horarios</option>}
                                      {scheduleCatalog.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name}
                                          {s.range ? ` (${s.range})` : ""}
                                          {u.scheduleId === s.id ? " · Bit2" : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      style={styles.assignBtn}
                                      onClick={() => handleAssignSchedule(u)}
                                      disabled={updatingId === u.id || selValue === "" || selValue === eff.id}
                                      title="Asignar horario seleccionado"
                                    >
                                      <Check size={13} strokeWidth={2.6} />
                                      Asignar
                                    </button>
                                    {eff.overridden && (
                                      <button
                                        type="button"
                                        style={styles.revertBtn}
                                        onClick={() => handleClearOverride(u)}
                                        disabled={updatingId === u.id}
                                        title="Quitar override y volver al horario de Bit2"
                                      >
                                        <RotateCcw size={13} strokeWidth={2.6} />
                                        Volver a Bit2
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Container>
      </Main>

      <Sheet
        open={excludedOpen}
        onClose={() => setExcludedOpen(false)}
        title={`Usuarios excluidos (${excludedUsers.length})`}
        placement="center"
        maxWidth={640}
      >
        <Sheet.Body>
          {excludedUsers.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="Sin usuarios excluidos"
              description="Todos los usuarios sincronizados están activos en horas extra."
            />
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>N° Ficha</th>
                    <th style={styles.th}>Nombre</th>
                    <th style={styles.th}>Coordinador</th>
                    <th style={styles.thCenter}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {excludedUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={styles.td}>{u.idDevice ?? "—"}</td>
                      <td style={styles.td}>{u.fullName || "—"}</td>
                      <td style={styles.td}>{u.coordinatorName || "—"}</td>
                      <td style={styles.tdCenter}>
                        <button
                          type="button"
                          style={styles.rowBtnReinclude}
                          onClick={() => setExcluded(u, false)}
                          disabled={updatingId === u.id}
                          title="Reincluir en horas extra"
                        >
                          <UserCheck size={13} strokeWidth={2.4} />
                          Reincluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sheet.Body>
      </Sheet>

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
