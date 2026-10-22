// Matriz de permisos por roles (solo dev).
//
//   • Matriz      — filas = permisos/botones, columnas = roles de permisos.
//   • Usuarios    — asignar rol de permisos (en lote) y excepciones por usuario.
//   • Migración   — crear roles a partir de las combinaciones de permisos que ya
//                   existen, sin cambiarle nada a nadie.
//
// El permiso efectivo (rol + excepciones) se guarda en profiles.permisos, que es
// lo que leen las reglas de Firestore, Desk y la app móvil.

import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Grid3x3, Plus, Save, Shield, Trash2, Undo2, Users, Wand2 } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";

import {
  Badge,
  Brand,
  Button,
  Card,
  Chip,
  ChipsRow,
  Container,
  EmptyState,
  Field,
  GhostButton,
  Hero,
  Main,
  SearchInput,
  Sheet,
  Shell,
  Spinner,
  TableScroll,
  Topbar,
  theme,
  useConfirm,
  useToast,
} from "../../../components/ui";
import { AuthCtx } from "../../../auth/AuthProvider";
import { db } from "../../../firebase";
import { PERMISSION_LABELS } from "../../../config/permissions";
import { boolMap, hashPermisos } from "../../../config/permRoles";
import {
  assignRoleToProfiles,
  createPermissionRole,
  deletePermissionRole,
  listenPermissionRoles,
  saveProfileOverrides,
  updatePermissionRole,
} from "../../../services/permissionRoles";
import RolesMatrix from "./RolesMatrix";
import UserOverridesSheet from "./UserOverridesSheet";

const TABS = [
  { key: "matriz", label: "Matriz", icon: Grid3x3 },
  { key: "usuarios", label: "Usuarios", icon: Users },
  { key: "migracion", label: "Migración", icon: Wand2 },
];

const userName = (u) => u.displayName || u.username || u.email || u.id;

export default function PermisosMatrizPage() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { role: myRole } = useContext(AuthCtx) || {};
  const isDev = myRole === "dev";

  const [tab, setTab] = useState("matriz");
  const [roles, setRoles] = useState(null);
  const [users, setUsers] = useState(null);
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState(false);
  const [roleSheet, setRoleSheet] = useState(null); // { mode: "new"|"edit"|"dup", role?, nombre, descripcion }
  const [ovUser, setOvUser] = useState(null);

  useEffect(() => {
    const u1 = listenPermissionRoles(setRoles, (e) => {
      console.error(e);
      toast.error("No se pudieron cargar los roles de permisos.");
      setRoles([]);
    });
    const u2 = onSnapshot(
      collection(db, "profiles"),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.error(e);
        toast.error("No se pudieron cargar los usuarios.");
        setUsers([]);
      }
    );
    return () => {
      u1();
      u2();
    };
  }, [toast]);

  // El borrador se resincroniza con el servidor salvo en los roles con cambios sin guardar.
  useEffect(() => {
    if (!roles) return;
    setDraft((prev) => {
      const next = {};
      for (const r of roles) next[r.id] = dirty[r.id] ? prev[r.id] : boolMap(r.permisos);
      return next;
    });
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const userCounts = useMemo(() => {
    const c = {};
    for (const u of users || []) if (u.permRoleId) c[u.permRoleId] = (c[u.permRoleId] || 0) + 1;
    return c;
  }, [users]);

  const dirtyCount = Object.keys(dirty).length;

  const onSet = (roleId, key, value) => {
    setDraft((p) => ({ ...p, [roleId]: { ...(p[roleId] || {}), [key]: value } }));
    setDirty((p) => ({ ...p, [roleId]: true }));
  };

  const discard = () => {
    setDirty({});
    setDraft(Object.fromEntries((roles || []).map((r) => [r.id, boolMap(r.permisos)])));
  };

  const saveMatrix = async () => {
    const ids = Object.keys(dirty);
    const affected = ids.reduce((a, id) => a + (userCounts[id] || 0), 0);
    const ok = await confirm({
      title: "Guardar matriz",
      message: `Se actualizan ${ids.length} rol(es) y se recalculan los permisos de ${affected} usuario(s) en Desk y en la app móvil.`,
      confirmText: "Guardar",
    });
    if (!ok) return;
    try {
      setSaving(true);
      for (const id of ids) await updatePermissionRole(id, { permisos: draft[id] || {} });
      setDirty({});
      toast.success("Matriz guardada. Los usuarios reciben el cambio en segundos.");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "No se pudo guardar la matriz.");
    } finally {
      setSaving(false);
    }
  };

  const openNewRole = () => setRoleSheet({ mode: "new", nombre: "", descripcion: "" });
  const openEditRole = (r) => setRoleSheet({ mode: "edit", role: r, nombre: r.nombre, descripcion: r.descripcion || "" });

  const submitRole = async () => {
    const { mode, role, nombre, descripcion } = roleSheet;
    try {
      if (mode === "edit") {
        await updatePermissionRole(role.id, { nombre, descripcion });
        toast.success("Rol actualizado.");
      } else {
        const permisos = mode === "dup" ? draft[role.id] || role.permisos : {};
        await createPermissionRole({ nombre, descripcion, permisos, orden: (roles?.length || 0) * 10 + 10 });
        toast.success("Rol creado. Marcá sus permisos en la matriz.");
      }
      setRoleSheet(null);
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el rol.");
    }
  };

  const removeRole = async (r) => {
    const ok = await confirm({
      title: "Borrar rol",
      message: `¿Borrar el rol «${r.nombre}»? Solo se puede si no tiene usuarios.`,
      confirmText: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePermissionRole(r.id);
      setRoleSheet(null);
      toast.success("Rol borrado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo borrar el rol.");
    }
  };

  if (!isDev) {
    return (
      <Shell>
        <Main>
          <Container>
            <EmptyState center icon={Shield} title="Solo dev" description="La matriz de permisos solo la administra un usuario dev." />
          </Container>
        </Main>
      </Shell>
    );
  }

  const loading = roles === null || users === null;

  return (
    <Shell>
      <Topbar>
        <Brand icon={Shield} title="Matriz de permisos" subtitle="Roles y permisos por botón" onClick={() => nav("/administracion")} />
        <Topbar.Right>
          {tab === "matriz" && dirtyCount ? (
            <>
              <GhostButton icon={Undo2} onClick={discard} disabled={saving}>
                Descartar
              </GhostButton>
              <Button icon={Save} onClick={saveMatrix} loading={saving}>
                Guardar cambios ({dirtyCount})
              </Button>
            </>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Administración · solo dev"
            title="Matriz de permisos"
            subtitle="Definí qué puede hacer cada rol, hasta el nivel de botón. Lo que marques aquí aplica en AppOLO Desk y en la app móvil."
            badge={<Badge icon={Shield}>{roles ? `${roles.length} rol(es)` : "Cargando"}</Badge>}
          />

          <ChipsRow style={{ marginBottom: theme.SPACE_4 }}>
            {TABS.map((t) => (
              <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                <t.icon size={14} style={{ marginRight: 6 }} />
                {t.label}
              </Chip>
            ))}
          </ChipsRow>

          {loading ? (
            <Spinner label="Cargando roles y usuarios..." />
          ) : tab === "matriz" ? (
            <Card padding={theme.SPACE_4} style={{ display: "grid", gap: theme.SPACE_3 }}>
              <div style={s.rowBetween}>
                <div style={s.hint}>
                  Tocá el nombre de un rol para editarlo, duplicarlo o borrarlo. Los cambios quedan en borrador hasta
                  «Guardar cambios».
                </div>
                <Button icon={Plus} onClick={openNewRole}>
                  Nuevo rol
                </Button>
              </div>
              {roles.length === 0 ? (
                <EmptyState
                  icon={Grid3x3}
                  title="Todavía no hay roles de permisos"
                  description="Creá uno con «Nuevo rol», o andá a «Migración» para crearlos desde las combinaciones que ya usan los usuarios."
                />
              ) : (
                <RolesMatrix roles={roles} draft={draft} onSet={onSet} userCounts={userCounts} onEditRole={openEditRole} />
              )}
            </Card>
          ) : tab === "usuarios" ? (
            <UsersTab users={users} roles={roles} onOverrides={setOvUser} toast={toast} confirm={confirm} />
          ) : (
            <MigracionTab users={users} roles={roles} toast={toast} confirm={confirm} />
          )}
        </Container>
      </Main>

      <Sheet open={!!roleSheet} onClose={() => setRoleSheet(null)} title={roleSheet?.mode === "edit" ? "Editar rol" : roleSheet?.mode === "dup" ? "Duplicar rol" : "Nuevo rol"} maxWidth={520}>
        {roleSheet ? (
          <div style={{ display: "grid", gap: theme.SPACE_3 }}>
            <Field label="Nombre" htmlFor="rol-nombre">
              <Field.Input id="rol-nombre" value={roleSheet.nombre} onChange={(e) => setRoleSheet({ ...roleSheet, nombre: e.target.value })} placeholder="Ej.: Técnico de mantenimiento" />
            </Field>
            <Field label="Descripción" htmlFor="rol-desc">
              <Field.Input id="rol-desc" value={roleSheet.descripcion} onChange={(e) => setRoleSheet({ ...roleSheet, descripcion: e.target.value })} placeholder="Para quién es este rol" />
            </Field>
            <div style={s.rowBetween}>
              {roleSheet.mode === "edit" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <GhostButton icon={Copy} onClick={() => setRoleSheet({ ...roleSheet, mode: "dup", nombre: `${roleSheet.nombre} (copia)` })}>
                    Duplicar
                  </GhostButton>
                  <GhostButton icon={Trash2} onClick={() => removeRole(roleSheet.role)}>
                    Borrar
                  </GhostButton>
                </div>
              ) : (
                <span />
              )}
              <Button onClick={submitRole} disabled={!roleSheet.nombre.trim()}>
                {roleSheet.mode === "edit" ? "Guardar" : "Crear rol"}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>

      <UserOverridesSheet
        open={!!ovUser}
        user={ovUser}
        role={roles?.find((r) => r.id === ovUser?.permRoleId) || null}
        onClose={() => setOvUser(null)}
        onSave={async (ov) => {
          try {
            const role = roles.find((r) => r.id === ovUser.permRoleId);
            await saveProfileOverrides(ovUser.id, role, ov);
            toast.success("Excepciones guardadas.");
            setOvUser(null);
          } catch (e) {
            toast.error(e?.message || "No se pudieron guardar las excepciones.");
          }
        }}
      />
    </Shell>
  );
}

// ── Usuarios ─────────────────────────────────────────────────────────────

function UsersTab({ users, roles, onOverrides, toast, confirm }) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [selected, setSelected] = useState([]);
  const [targetRole, setTargetRole] = useState("");
  const [mode, setMode] = useState("conservar");
  const [busy, setBusy] = useState(false);

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (filterRole === "__none") return !u.permRoleId;
        if (filterRole) return u.permRoleId === filterRole;
        return true;
      })
      .filter((u) => !q || `${userName(u)} ${u.email || ""} ${u.username || ""}`.toLowerCase().includes(q))
      .sort((a, b) => userName(a).localeCompare(userName(b), "es"));
  }, [users, search, filterRole]);

  const toggle = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allVisible = list.length > 0 && list.every((u) => selected.includes(u.id));

  const assign = async () => {
    const role = targetRole === "__none" ? null : roleById[targetRole];
    if (targetRole !== "__none" && !role) return;
    const profiles = users.filter((u) => selected.includes(u.id));
    const ok = await confirm({
      title: role ? `Asignar «${role.nombre}»` : "Quitar rol de permisos",
      message: role
        ? mode === "conservar"
          ? `${profiles.length} usuario(s) pasan al rol y conservan EXACTAMENTE lo que ven hoy (las diferencias quedan como excepciones).`
          : `${profiles.length} usuario(s) quedan iguales al rol: se borran sus excepciones y pueden ganar o perder accesos.`
        : `${profiles.length} usuario(s) vuelven a permisos manuales (conservan su permiso efectivo actual).`,
      confirmText: role ? "Asignar" : "Quitar rol",
      tone: mode === "rol" ? "danger" : undefined,
    });
    if (!ok) return;
    try {
      setBusy(true);
      await assignRoleToProfiles(profiles, role, mode);
      setSelected([]);
      toast.success("Asignación guardada.");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "No se pudo asignar el rol.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding={theme.SPACE_4} style={{ display: "grid", gap: theme.SPACE_3 }}>
      <div style={s.filters}>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar usuario..." style={{ flex: 1, minWidth: 220 }} />
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={s.select}>
          <option value="">Todos los roles de permisos</option>
          <option value="__none">Sin rol (permisos manuales)</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      {selected.length ? (
        <div style={s.bulk}>
          <strong>{selected.length} seleccionado(s)</strong>
          <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} style={s.select}>
            <option value="">Elegí un rol…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
            <option value="__none">Quitar rol (volver a manual)</option>
          </select>
          {targetRole && targetRole !== "__none" ? (
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={s.select}>
              <option value="conservar">Conservar lo que ve hoy (recomendado)</option>
              <option value="rol">Dejarlo igual al rol</option>
            </select>
          ) : null}
          <Button onClick={assign} loading={busy} disabled={!targetRole}>
            Aplicar
          </Button>
          <GhostButton onClick={() => setSelected([])}>Limpiar selección</GhostButton>
        </div>
      ) : null}

      <TableScroll minWidth={820}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() => setSelected(allVisible ? [] : list.map((u) => u.id))}
                  aria-label="Seleccionar todos"
                />
              </th>
              <th style={s.th}>Usuario</th>
              <th style={s.th}>Rol del sistema</th>
              <th style={s.th}>Rol de permisos</th>
              <th style={s.th}>Excepciones</th>
              <th style={s.th}>Permisos activos</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const ovCount = Object.keys(u.permisosOverrides || {}).length;
              const activos = Object.entries(u.permisos || {}).filter(([, v]) => v === true).map(([k]) => k);
              return (
                <tr key={u.id} style={s.tr}>
                  <td style={s.td}>
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} aria-label={`Seleccionar ${userName(u)}`} />
                  </td>
                  <td style={s.td}>
                    <div style={{ fontWeight: theme.FW_BOLD }}>{userName(u)}</div>
                    <div style={s.sub}>{u.email || u.username || ""}</div>
                  </td>
                  <td style={s.td}>{u.role || "—"}</td>
                  <td style={s.td}>{u.permRoleId ? roleById[u.permRoleId]?.nombre || "(rol borrado)" : <span style={s.sub}>Manual</span>}</td>
                  <td style={s.td}>{u.permRoleId ? ovCount || "—" : ""}</td>
                  <td style={{ ...s.td, maxWidth: 320 }}>
                    <span style={s.sub} title={activos.map((k) => PERMISSION_LABELS[k] || k).join(", ")}>
                      {activos.length ? `${activos.length}: ${activos.slice(0, 4).map((k) => PERMISSION_LABELS[k] || k).join(", ")}${activos.length > 4 ? "…" : ""}` : "Ninguno"}
                    </span>
                  </td>
                  <td style={s.td}>
                    {u.permRoleId ? (
                      <GhostButton size="sm" onClick={() => onOverrides(u)}>
                        Excepciones
                      </GhostButton>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}

// ── Migración ────────────────────────────────────────────────────────────

function MigracionTab({ users, roles, toast, confirm }) {
  const [busyKey, setBusyKey] = useState("");

  const combos = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      if (u.permRoleId) continue;
      if (u.role === "dev" || u.role === "administrativo") continue; // ya tienen todo por rol
      const h = hashPermisos(u.permisos || {});
      const cur = map.get(h) || { hash: h, users: [] };
      cur.users.push(u);
      map.set(h, cur);
    }
    return [...map.values()].sort((a, b) => b.users.length - a.users.length);
  }, [users]);

  const create = async (combo) => {
    const keys = combo.hash ? combo.hash.split(",") : [];
    const nombre = window.prompt(
      "Nombre del rol nuevo:",
      keys.length ? keys.slice(0, 3).map((k) => PERMISSION_LABELS[k] || k).join(" + ") : "Sin permisos"
    );
    if (!nombre || !nombre.trim()) return;
    const ok = await confirm({
      title: "Crear rol y asignar",
      message: `Se crea «${nombre.trim()}» con estos ${keys.length} permiso(s) y se asigna a ${combo.users.length} usuario(s). Nadie gana ni pierde accesos.`,
      confirmText: "Crear y asignar",
    });
    if (!ok) return;
    try {
      setBusyKey(combo.hash || "__empty");
      const permisos = Object.fromEntries(keys.map((k) => [k, true]));
      const id = await createPermissionRole({ nombre, permisos, orden: (roles.length + 1) * 10 });
      await assignRoleToProfiles(combo.users, { id, permisos }, "conservar");
      toast.success(`Rol «${nombre.trim()}» creado y asignado a ${combo.users.length} usuario(s).`);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "No se pudo crear el rol.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <Card padding={theme.SPACE_4} style={{ display: "grid", gap: theme.SPACE_3 }}>
      <div style={s.hint}>
        Combinaciones de permisos que hoy tienen los usuarios <strong>sin rol de permisos</strong> (operativos y
        operadores; dev y administrativo ya tienen todo por su rol). Creá un rol desde una combinación y se asigna a esos
        usuarios sin cambiarles nada.
      </div>
      {combos.length === 0 ? (
        <EmptyState icon={Wand2} title="Nada para migrar" description="Todos los usuarios operativos ya tienen un rol de permisos." />
      ) : (
        <TableScroll minWidth={720}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Usuarios</th>
                <th style={s.th}>Permisos de la combinación</th>
                <th style={s.th}>Ejemplos</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const keys = c.hash ? c.hash.split(",") : [];
                return (
                  <tr key={c.hash || "__empty"} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: theme.FW_EXTRABOLD }}>{c.users.length}</td>
                    <td style={s.td}>{keys.length ? keys.map((k) => PERMISSION_LABELS[k] || k).join(", ") : <span style={s.sub}>Sin permisos</span>}</td>
                    <td style={{ ...s.td, ...s.sub }}>{c.users.slice(0, 3).map(userName).join(", ")}{c.users.length > 3 ? "…" : ""}</td>
                    <td style={s.td}>
                      <Button size="sm" icon={Plus} onClick={() => create(c)} loading={busyKey === (c.hash || "__empty")}>
                        Crear rol
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}

const s = {
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: theme.SPACE_3, flexWrap: "wrap" },
  hint: { color: theme.SLATE, fontSize: theme.FS_SM, lineHeight: 1.5, maxWidth: 760 },
  filters: { display: "flex", gap: theme.SPACE_3, flexWrap: "wrap", alignItems: "center" },
  select: {
    padding: "9px 12px",
    borderRadius: theme.RADIUS_MD,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    color: theme.TEXT,
    fontWeight: theme.FW_SEMIBOLD,
    fontSize: theme.FS_SM,
  },
  bulk: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    flexWrap: "wrap",
    padding: theme.SPACE_3,
    borderRadius: theme.RADIUS,
    background: theme.ACCENT_SOFT,
    border: `1px solid ${theme.ACCENT_BORDER}`,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_INSET,
    color: theme.SLATE,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_EXTRABOLD,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tr: { borderBottom: `1px solid ${theme.BORDER_SOFT}` },
  td: { padding: "9px 12px", color: theme.TEXT, verticalAlign: "middle" },
  sub: { color: theme.SLATE, fontSize: theme.FS_XS },
};
