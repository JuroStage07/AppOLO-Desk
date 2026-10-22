// Matriz permisos × roles: filas = permisos (agrupados por módulo y botón),
// columnas = roles de permisos. Edición en borrador y guardado en lote.
//
// Regla de cada módulo (igual que la app): la fila «Acceso total» da todas las
// acciones del módulo; las acciones sueltas permiten dar solo algunos botones.

import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Monitor, Smartphone } from "lucide-react";

import { Badge, Chip, ChipsRow, SearchInput, TableScroll, theme } from "../../../components/ui";
import { ACTION_INDEX, PERMISSION_CATALOG } from "../../../config/permissionCatalog";

function AppBadges({ apps }) {
  if (!apps?.length) return null;
  return (
    <span style={s.apps}>
      {apps.includes("desk") ? <Monitor size={12} aria-label="Desk" /> : null}
      {apps.includes("movil") ? <Smartphone size={12} aria-label="Móvil" /> : null}
    </span>
  );
}

function Cell({ checked, implied, disabled, onToggle, label }) {
  const on = checked || implied;
  return (
    <td style={s.cellTd}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || implied}
        aria-pressed={on}
        aria-label={label}
        title={implied ? "Ya incluido por otro permiso marcado (p. ej. «Acceso total»)" : label}
        style={{
          ...s.cellBtn,
          ...(checked ? s.cellOn : implied ? s.cellImplied : {}),
          ...(disabled ? { cursor: "default" } : {}),
        }}
      >
        {on ? <Check size={14} strokeWidth={3} /> : null}
      </button>
    </td>
  );
}

/**
 * @param {object} props
 * @param {Array<{ id: string, nombre: string, permisos: object }>} props.roles
 * @param {Record<string, Record<string, boolean>>} props.draft  roleId → permisos en edición
 * @param {(roleId: string, key: string, value: boolean) => void} props.onSet
 * @param {Record<string, number>} props.userCounts
 * @param {(role: object) => void} props.onEditRole
 * @param {boolean} props.readOnly
 */
export default function RolesMatrix({ roles, draft, onSet, userCounts, onEditRole, readOnly }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [collapsed, setCollapsed] = useState({});

  const groups = useMemo(() => [...new Set(PERMISSION_CATALOG.map((m) => m.group))], []);

  const modules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PERMISSION_CATALOG.filter((m) => !group || m.group === group)
      .map((m) => {
        if (!q) return m;
        const modHit = m.label.toLowerCase().includes(q);
        const actions = m.actions.filter(
          (a) => modHit || a.label.toLowerCase().includes(q) || a.key.toLowerCase().includes(q)
        );
        return actions.length || modHit ? { ...m, actions } : null;
      })
      .filter(Boolean);
  }, [search, group]);

  const val = (roleId, key) => draft[roleId]?.[key] === true;

  const setModule = (roleId, mod, value) => {
    if (mod.fullKey) onSet(roleId, mod.fullKey, value);
    for (const a of mod.actions) onSet(roleId, a.key, value && !mod.fullKey);
  };

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar permiso o botón..." style={{ flex: 1, minWidth: 220 }} />
      </div>
      <ChipsRow>
        <Chip active={!group} onClick={() => setGroup("")}>
          Todos
        </Chip>
        {groups.map((g) => (
          <Chip key={g} active={group === g} onClick={() => setGroup(group === g ? "" : g)}>
            {g}
          </Chip>
        ))}
      </ChipsRow>

      <TableScroll minWidth={360 + roles.length * 120}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.stickyCol, ...s.thFirst }}>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} style={s.thRole}>
                  <button type="button" style={s.roleHead} onClick={() => onEditRole(r)} title="Editar rol">
                    <span style={s.roleName}>{r.nombre}</span>
                    <span style={s.roleCount}>{userCounts[r.id] || 0} usuario(s)</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const isCollapsed = collapsed[m.key] && !search;
              return (
                <React.Fragment key={m.key}>
                  <tr style={s.modRow}>
                    <td style={{ ...s.modTd, ...s.stickyCol, background: theme.SURFACE_INSET }}>
                      <button
                        type="button"
                        style={s.modToggle}
                        onClick={() => setCollapsed((p) => ({ ...p, [m.key]: !p[m.key] }))}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span style={s.modLabel}>{m.label}</span>
                        <Badge>{m.group}</Badge>
                      </button>
                    </td>
                    {roles.map((r) => {
                      const full = m.fullKey ? val(r.id, m.fullKey) : m.actions.every((a) => val(r.id, a.key));
                      return (
                        <td key={r.id} style={{ ...s.cellTd, background: theme.SURFACE_INSET }}>
                          {readOnly ? null : (
                            <button type="button" style={s.modAll} onClick={() => setModule(r.id, m, !full)}>
                              {full ? "Quitar todo" : "Todo"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {!isCollapsed && m.fullKey ? (
                    <tr style={s.tr}>
                      <td style={{ ...s.td, ...s.stickyCol }}>
                        <div style={s.permLabel}>
                          <strong>Acceso total</strong>
                          <AppBadges apps={["desk", "movil"]} />
                        </div>
                        <div style={s.permKey}>{m.fullKey}</div>
                      </td>
                      {roles.map((r) => (
                        <Cell
                          key={r.id}
                          checked={val(r.id, m.fullKey)}
                          disabled={readOnly}
                          onToggle={() => onSet(r.id, m.fullKey, !val(r.id, m.fullKey))}
                          label={`${m.label} · Acceso total · ${r.nombre}`}
                        />
                      ))}
                    </tr>
                  ) : null}

                  {!isCollapsed &&
                    m.actions.map((a) => (
                      <tr key={a.key} style={s.tr}>
                        <td style={{ ...s.td, ...s.stickyCol, paddingLeft: 26 }}>
                          <div style={s.permLabel}>
                            <span>{a.label}</span>
                            <AppBadges apps={a.apps} />
                          </div>
                          {a.desc ? <div style={s.permDesc}>{a.desc}</div> : null}
                          <div style={s.permKey}>{a.key}</div>
                        </td>
                        {roles.map((r) => (
                          <Cell
                            key={r.id}
                            checked={val(r.id, a.key)}
                            implied={(ACTION_INDEX[a.key]?.action.impliedBy || []).some((k) => k !== a.key && val(r.id, k))}
                            disabled={readOnly}
                            onToggle={() => onSet(r.id, a.key, !val(r.id, a.key))}
                            label={`${m.label} · ${a.label} · ${r.nombre}`}
                          />
                        ))}
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

const s = {
  wrap: { display: "grid", gap: theme.SPACE_3 },
  toolbar: { display: "flex", gap: theme.SPACE_3, flexWrap: "wrap", alignItems: "center" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: theme.SURFACE,
    borderBottom: `1px solid ${theme.BORDER}`,
    padding: "10px 12px",
    textAlign: "left",
    color: theme.SLATE,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_EXTRABOLD,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thFirst: { zIndex: 3, minWidth: 300 },
  thRole: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: theme.SURFACE,
    borderBottom: `1px solid ${theme.BORDER}`,
    padding: "6px 6px",
    minWidth: 112,
    verticalAlign: "bottom",
  },
  roleHead: {
    display: "grid",
    gap: 2,
    width: "100%",
    padding: "6px 8px",
    borderRadius: theme.RADIUS_SM,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
    cursor: "pointer",
    textAlign: "center",
  },
  roleName: { color: theme.TEXT, fontWeight: theme.FW_EXTRABOLD, fontSize: theme.FS_SM },
  roleCount: { color: theme.SLATE, fontSize: theme.FS_XS, fontWeight: theme.FW_BOLD },
  stickyCol: { position: "sticky", left: 0, zIndex: 1, background: theme.SURFACE },
  modRow: {},
  modTd: { padding: "8px 10px", borderBottom: `1px solid ${theme.BORDER}`, borderTop: `1px solid ${theme.BORDER}` },
  modToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: theme.TEXT,
    padding: 0,
  },
  modLabel: { fontWeight: theme.FW_EXTRABOLD, fontSize: theme.FS_BASE },
  modAll: {
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    borderRadius: theme.RADIUS_PILL,
    padding: "3px 10px",
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_BOLD,
    color: theme.SLATE,
    cursor: "pointer",
  },
  tr: {},
  td: { padding: "8px 12px", borderBottom: `1px solid ${theme.BORDER_SOFT}`, color: theme.TEXT },
  permLabel: { display: "flex", alignItems: "center", gap: 8, fontWeight: theme.FW_SEMIBOLD },
  permDesc: { color: theme.SLATE, fontSize: theme.FS_XS, marginTop: 2 },
  permKey: { color: theme.MUTED, fontSize: 10, fontFamily: "ui-monospace, Consolas, monospace", marginTop: 2 },
  apps: { display: "inline-flex", gap: 4, color: theme.MUTED },
  cellTd: { textAlign: "center", borderBottom: `1px solid ${theme.BORDER_SOFT}`, padding: "6px 4px" },
  cellBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: `1.5px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    display: "inline-grid",
    placeItems: "center",
    cursor: "pointer",
    color: "#fff",
  },
  cellOn: { background: theme.ACCENT, borderColor: theme.ACCENT },
  cellImplied: { background: theme.ACCENT_SOFT, borderColor: theme.ACCENT_BORDER, color: theme.ACCENT, cursor: "default" },
};
