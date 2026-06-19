import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Filter,
  RefreshCw,
  Save,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Badge,
  Brand,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  PrimaryButton,
  Shell,
  Spinner,
  Topbar,
  useToast,
} from "../../components/ui";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  DANGER,
  DANGER_BG,
  FS_BASE,
  FS_SM,
  FS_XS,
  FW_BOLD,
  FW_EXTRABOLD,
  OK_BG,
  OK_BORDER,
  RADIUS_LG,
  RADIUS_2XL,
  RADIUS_PILL,
  SHADOW_CARD,
  SLATE,
  SPACE_4,
  SPACE_6,
  SPACE_8,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../styles/theme";

/* ─── Constants ─── */
const ROLES = ["dev", "administrativo", "operativo"];

const PERMISOS_KEYS = [
  "mantenimiento",
  "saludOcupacional",
  "canRecepcionCofersa",
  "despachosEPA",
  "serviciosGenerales",
  "documentacion",
  "zoneFranca",
  "mrpTarimas",
];

/* ─── Styles ─── */
const s = {
  filtersBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: `${SPACE_4}px 0`,
  },
  searchWrap: {
    position: "relative",
    flex: "1 1 220px",
    maxWidth: 320,
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: SLATE,
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    padding: "10px 12px 10px 36px",
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    fontFamily: "inherit",
    background: SURFACE,
    color: TEXT,
    outline: "none",
  },
  selectFilter: {
    appearance: "none",
    WebkitAppearance: "none",
    padding: "10px 14px",
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    fontFamily: "inherit",
    background: SURFACE,
    color: TEXT,
    cursor: "pointer",
    minWidth: 160,
  },
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
    fontSize: 18,
    fontWeight: FW_EXTRABOLD,
    color: TEXT,
  },
  sectionSubtitle: {
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    color: SLATE,
    marginTop: 2,
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
    padding: "0 14px 14px",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_INSET,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: 12,
    paddingTop: 14,
  },
  fieldGroup: {
    display: "grid",
    gap: 4,
  },
  fieldLabel: {
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldInput: {
    padding: "8px 12px",
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    fontFamily: "inherit",
    background: SURFACE,
    color: TEXT,
    outline: "none",
    width: "100%",
  },
  fieldSelect: {
    appearance: "none",
    WebkitAppearance: "none",
    padding: "8px 12px",
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    fontSize: FS_SM,
    fontWeight: FW_BOLD,
    fontFamily: "inherit",
    background: SURFACE,
    color: TEXT,
    cursor: "pointer",
    width: "100%",
  },
  permisosGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
    gap: 8,
    paddingTop: 8,
  },
  permisoItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: RADIUS_LG,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    cursor: "pointer",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    color: TEXT,
    userSelect: "none",
  },
  permisoItemActive: {
    background: OK_BG,
    borderColor: OK_BORDER,
    color: ACCENT,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `2px solid ${BORDER}`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  checkboxActive: {
    background: ACCENT,
    borderColor: ACCENT,
  },
  epaToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    cursor: "pointer",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    color: TEXT,
    userSelect: "none",
  },
  epaToggleActive: {
    background: DANGER_BG,
    borderColor: DANGER,
    color: DANGER,
  },
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTop: `1px dashed ${BORDER}`,
    marginTop: 12,
  },
  saveBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: RADIUS_PILL,
    border: "none",
    background: ACCENT,
    color: "#fff",
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cancelBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: SLATE,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  roleBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: RADIUS_PILL,
    fontSize: FS_XS,
    fontWeight: FW_EXTRABOLD,
  },
};

/* ─── Helpers ─── */
function roleBadgeStyle(role) {
  switch (role) {
    case "dev":
      return { background: "rgba(124,58,237,0.12)", color: "#7C3AED" };
    case "administrativo":
      return { background: ACCENT_SOFT, color: ACCENT };
    case "operativo":
      return { background: "rgba(234,88,12,0.12)", color: "#EA580C" };
    default:
      return { background: SURFACE_INSET, color: SLATE };
  }
}

/* ─── Page ─── */
export default function UserHub() {
  const nav = useNavigate();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState({}); // { [uid]: { ...editableFields } }
  const [saving, setSaving] = useState(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const toggleExpanded = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  /* ─── Load all profiles ─── */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "profiles"), orderBy("displayName"));
      const snap = await getDocs(q);
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching profiles:", err);
      toast.error("Error al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ─── Derive filter options from data ─── */
  const tenants = useMemo(() => {
    const set = new Set();
    users.forEach((u) => {
      if (u.tenantId) set.add(u.tenantId);
    });
    return Array.from(set).sort();
  }, [users]);

  const companies = useMemo(() => {
    const set = new Set();
    users.forEach((u) => {
      if (u.company) set.add(u.company);
    });
    return Array.from(set).sort();
  }, [users]);

  /* ─── Filtered list ─── */
  const filtered = useMemo(() => {
    let list = users;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (u) =>
          (u.displayName || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.id || "").toLowerCase().includes(q)
      );
    }
    if (filterTenant) {
      list = list.filter((u) => u.tenantId === filterTenant);
    }
    if (filterCompany) {
      list = list.filter((u) => u.company === filterCompany);
    }
    if (filterRole) {
      list = list.filter((u) => u.role === filterRole);
    }
    return list;
  }, [users, searchText, filterTenant, filterCompany, filterRole]);

  /* ─── Editing helpers ─── */
  const startEdit = (user) => {
    setEditing((prev) => ({
      ...prev,
      [user.id]: {
        role: user.role || "",
        tenantId: user.tenantId || "",
        company: user.company || "",
        epaAdmin: user.epaAdmin === true,
        permisos: { ...user.permisos },
      },
    }));
  };

  const cancelEdit = (uid) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const updateField = (uid, field, value) => {
    setEditing((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], [field]: value },
    }));
  };

  const togglePermiso = (uid, key) => {
    setEditing((prev) => {
      const current = prev[uid]?.permisos || {};
      return {
        ...prev,
        [uid]: {
          ...prev[uid],
          permisos: { ...current, [key]: !current[key] },
        },
      };
    });
  };

  const handleSave = async (uid) => {
    const data = editing[uid];
    if (!data) return;
    setSaving(uid);
    try {
      const patch = {
        role: data.role || "",
        tenantId: data.tenantId || "",
        company: data.company || "",
        epaAdmin: data.epaAdmin === true,
        permisos: data.permisos || {},
      };
      await updateDoc(doc(db, "profiles", uid), patch);
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, ...patch } : u))
      );
      cancelEdit(uid);
      toast.success("Usuario actualizado correctamente.");
    } catch (err) {
      console.error("Error updating profile:", err);
      toast.error("No se pudo actualizar el usuario.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Users}
          title="Gestión de Usuarios"
          subtitle="Administración de plataforma"
          onClick={() => nav("/administracion/usuarios")}
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
            kicker="Administración"
            title="Usuarios"
            subtitle="Gestioná usuarios, roles, permisos, tenant y company de toda la plataforma."
            badge={<Badge icon={Shield} />}
          />

          <div style={s.section}>
            {/* Header */}
            <div style={s.sectionHeader}>
              <div style={s.sectionHeaderLeft}>
                <div style={s.sectionIcon}>
                  <Users size={20} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={s.sectionTitle}>
                    Todos los usuarios
                    {filtered.length > 0 && (
                      <span style={{ ...s.countBadge, marginLeft: 10 }}>
                        {filtered.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchUsers}
                disabled={loading}
                style={{
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
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <RefreshCw
                  size={15}
                  strokeWidth={2.4}
                  style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
                />
                Recargar
              </button>
            </div>

            {/* Filters */}
            <div style={s.filtersBar}>
              <div style={s.searchWrap}>
                <Search size={15} strokeWidth={2.4} style={s.searchIcon} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, email o UID..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={s.searchInput}
                />
              </div>
              <select
                value={filterTenant}
                onChange={(e) => setFilterTenant(e.target.value)}
                style={s.selectFilter}
              >
                <option value="">Todos los tenants</option>
                {tenants.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                style={s.selectFilter}
              >
                <option value="">Todas las companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                style={s.selectFilter}
              >
                <option value="">Todos los roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {(filterTenant || filterCompany || filterRole || searchText) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchText("");
                    setFilterTenant("");
                    setFilterCompany("");
                    setFilterRole("");
                  }}
                  style={{
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
                  }}
                >
                  <X size={13} strokeWidth={2.4} />
                  Limpiar
                </button>
              )}
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ textAlign: "center", padding: 32 }}>
                <Spinner />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Sin resultados"
                description="No se encontraron usuarios con los filtros aplicados."
              />
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nombre</th>
                      <th style={s.th}>Email</th>
                      <th style={s.th}>Role</th>
                      <th style={s.th}>Tenant</th>
                      <th style={s.th}>Company</th>
                      <th style={{ ...s.th, textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const isOpen = !!expanded[u.id];
                      const isEditing = !!editing[u.id];
                      const Chevron = isOpen ? ChevronDown : ChevronRight;
                      return (
                        <React.Fragment key={u.id}>
                          <tr>
                            <td style={s.td}>
                              <button
                                type="button"
                                style={s.nameToggle}
                                onClick={() => toggleExpanded(u.id)}
                                aria-expanded={isOpen}
                              >
                                <Chevron
                                  size={15}
                                  strokeWidth={2.6}
                                  style={{ color: ACCENT, flexShrink: 0 }}
                                />
                                <span>{u.displayName || u.nombre || "—"}</span>
                              </button>
                            </td>
                            <td style={s.td}>
                              <span style={{ fontSize: FS_XS, color: SLATE }}>
                                {u.email || "—"}
                              </span>
                            </td>
                            <td style={s.td}>
                              <span style={{ ...s.roleBadge, ...roleBadgeStyle(u.role) }}>
                                {u.role || "sin rol"}
                              </span>
                            </td>
                            <td style={s.td}>{u.tenantId || "—"}</td>
                            <td style={s.td}>{u.company || "—"}</td>
                            <td style={{ ...s.td, textAlign: "center" }}>
                              {!isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isOpen) toggleExpanded(u.id);
                                    startEdit(u);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 12px",
                                    borderRadius: RADIUS_PILL,
                                    border: `1px solid ${BORDER}`,
                                    background: SURFACE,
                                    color: ACCENT,
                                    fontSize: FS_XS,
                                    fontWeight: FW_EXTRABOLD,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <Edit3 size={13} strokeWidth={2.4} />
                                  Editar
                                </button>
                              ) : (
                                <span style={{ fontSize: FS_XS, color: ACCENT, fontWeight: FW_EXTRABOLD }}>
                                  Editando...
                                </span>
                              )}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td style={s.detailCell} colSpan={6}>
                                {isEditing ? (
                                  <EditForm
                                    uid={u.id}
                                    data={editing[u.id]}
                                    saving={saving === u.id}
                                    tenants={tenants}
                                    companies={companies}
                                    onUpdate={updateField}
                                    onTogglePermiso={togglePermiso}
                                    onSave={() => handleSave(u.id)}
                                    onCancel={() => cancelEdit(u.id)}
                                  />
                                ) : (
                                  <ReadOnlyDetail user={u} onEdit={() => startEdit(u)} />
                                )}
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
    </Shell>
  );
}

/* ─── Read-only detail (when not editing) ─── */
function ReadOnlyDetail({ user, onEdit }) {
  const permisos = user.permisos || {};
  const activePermisos = Object.entries(permisos)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  return (
    <div style={{ paddingTop: 14 }}>
      <div style={s.detailGrid}>
        <div style={s.fieldGroup}>
          <span style={s.fieldLabel}>UID</span>
          <span style={{ fontSize: FS_XS, color: SLATE, fontFamily: "monospace" }}>
            {user.id}
          </span>
        </div>
        <div style={s.fieldGroup}>
          <span style={s.fieldLabel}>Role</span>
          <span style={{ fontSize: FS_SM, color: TEXT, fontWeight: FW_BOLD }}>
            {user.role || "—"}
          </span>
        </div>
        <div style={s.fieldGroup}>
          <span style={s.fieldLabel}>Tenant ID</span>
          <span style={{ fontSize: FS_SM, color: TEXT, fontWeight: FW_BOLD }}>
            {user.tenantId || "—"}
          </span>
        </div>
        <div style={s.fieldGroup}>
          <span style={s.fieldLabel}>Company</span>
          <span style={{ fontSize: FS_SM, color: TEXT, fontWeight: FW_BOLD }}>
            {user.company || "—"}
          </span>
        </div>
        <div style={s.fieldGroup}>
          <span style={s.fieldLabel}>EPA Admin</span>
          <span style={{ fontSize: FS_SM, color: user.epaAdmin ? DANGER : SLATE, fontWeight: FW_BOLD }}>
            {user.epaAdmin ? "Sí" : "No"}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <span style={s.fieldLabel}>Permisos activos</span>
        {activePermisos.length === 0 ? (
          <div style={{ fontSize: FS_SM, color: SLATE, marginTop: 4 }}>
            Ninguno
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {activePermisos.map((k) => (
              <span
                key={k}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 10px",
                  borderRadius: RADIUS_PILL,
                  background: OK_BG,
                  border: `1px solid ${OK_BORDER}`,
                  color: ACCENT,
                  fontSize: FS_XS,
                  fontWeight: FW_EXTRABOLD,
                }}
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={s.actionsRow}>
        <button type="button" style={s.saveBtn} onClick={onEdit}>
          <Edit3 size={13} strokeWidth={2.4} />
          Editar usuario
        </button>
      </div>
    </div>
  );
}

/* ─── Edit form ─── */
function EditForm({
  uid,
  data,
  saving,
  tenants,
  companies,
  onUpdate,
  onTogglePermiso,
  onSave,
  onCancel,
}) {
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={s.detailGrid}>
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Role</label>
          <select
            value={data.role}
            onChange={(e) => onUpdate(uid, "role", e.target.value)}
            style={s.fieldSelect}
          >
            <option value="">— Sin rol —</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Tenant ID</label>
          <input
            type="text"
            value={data.tenantId}
            onChange={(e) => onUpdate(uid, "tenantId", e.target.value)}
            style={s.fieldInput}
            placeholder="Ej: VNZ"
            list={`tenants-${uid}`}
          />
          <datalist id={`tenants-${uid}`}>
            {tenants.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Company</label>
          <input
            type="text"
            value={data.company}
            onChange={(e) => onUpdate(uid, "company", e.target.value)}
            style={s.fieldInput}
            placeholder="Ej: OLO"
            list={`companies-${uid}`}
          />
          <datalist id={`companies-${uid}`}>
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>EPA Admin</label>
          <button
            type="button"
            onClick={() => onUpdate(uid, "epaAdmin", !data.epaAdmin)}
            style={{
              ...s.epaToggle,
              ...(data.epaAdmin ? s.epaToggleActive : {}),
            }}
          >
            <div
              style={{
                ...s.checkbox,
                ...(data.epaAdmin ? s.checkboxActive : {}),
              }}
            >
              {data.epaAdmin && <Check size={10} strokeWidth={3} color="#fff" />}
            </div>
            {data.epaAdmin ? "Activo" : "Inactivo"}
          </button>
        </div>
      </div>

      {/* Permisos */}
      <div style={{ marginTop: 16 }}>
        <span style={s.fieldLabel}>Permisos</span>
        <div style={s.permisosGrid}>
          {PERMISOS_KEYS.map((key) => {
            const active = !!data.permisos?.[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTogglePermiso(uid, key)}
                style={{
                  ...s.permisoItem,
                  ...(active ? s.permisoItemActive : {}),
                }}
              >
                <div
                  style={{
                    ...s.checkbox,
                    ...(active ? s.checkboxActive : {}),
                  }}
                >
                  {active && <Check size={10} strokeWidth={3} color="#fff" />}
                </div>
                {key}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={s.actionsRow}>
        <button
          type="button"
          style={s.saveBtn}
          onClick={onSave}
          disabled={saving}
        >
          <Save size={13} strokeWidth={2.4} />
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button
          type="button"
          style={s.cancelBtn}
          onClick={onCancel}
          disabled={saving}
        >
          <X size={13} strokeWidth={2.4} />
          Cancelar
        </button>
      </div>
    </div>
  );
}
