// Excepciones de un usuario sobre su rol de permisos: por cada permiso,
// «Según rol» / «Conceder» / «Quitar», mostrando el resultado efectivo.

import React, { useEffect, useMemo, useState } from "react";

import { Button, SearchInput, Sheet, theme } from "../../../components/ui";
import { ACTION_INDEX, PERMISSION_CATALOG } from "../../../config/permissionCatalog";
import { computeEffective } from "../../../config/permRoles";

const OPTIONS = [
  { v: "rol", label: "Según rol" },
  { v: true, label: "Conceder" },
  { v: false, label: "Quitar" },
];

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.user   perfil (id, displayName, permisosOverrides…)
 * @param {object|null} props.role   rol de permisos del usuario
 * @param {(overrides: Record<string, boolean>) => Promise<void>} props.onSave
 * @param {() => void} props.onClose
 */
export default function UserOverridesSheet({ open, user, role, onSave, onClose }) {
  const [ov, setOv] = useState({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOv({ ...(user?.permisosOverrides || {}) });
      setSearch("");
    }
  }, [open, user]);

  const rolePerms = useMemo(() => role?.permisos || {}, [role]);
  const eff = useMemo(() => computeEffective(rolePerms, ov), [rolePerms, ov]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = [];
    for (const m of PERMISSION_CATALOG) {
      const items = [
        ...(m.fullKey ? [{ key: m.fullKey, label: "Acceso total" }] : []),
        ...m.actions,
      ];
      for (const a of items) {
        if (q && !`${m.label} ${a.label} ${a.key}`.toLowerCase().includes(q)) continue;
        out.push({ module: m, ...a });
      }
    }
    return out;
  }, [search]);

  const setKey = (key, v) =>
    setOv((p) => {
      const next = { ...p };
      if (v === "rol") delete next[key];
      else next[key] = v;
      return next;
    });

  const save = async () => {
    try {
      setSaving(true);
      await onSave(ov);
    } finally {
      setSaving(false);
    }
  };

  const count = Object.keys(ov).length;
  const name = user?.displayName || user?.username || user?.email || user?.id;

  return (
    <Sheet open={open} onClose={onClose} title={`Excepciones · ${name || ""}`} maxWidth={860}>
      <div style={s.wrap}>
        <div style={s.hint}>
          Rol de permisos: <strong>{role?.nombre || "—"}</strong>. Las excepciones se aplican solo a este usuario y se
          mantienen aunque el rol cambie. {count ? `${count} excepción(es).` : "Sin excepciones."}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar permiso..." />
        <div style={s.list}>
          {rows.map((r) => {
            const cur = Object.prototype.hasOwnProperty.call(ov, r.key) ? ov[r.key] : "rol";
            const roleVal = rolePerms[r.key] === true;
            const fullOn = (ACTION_INDEX[r.key]?.action.impliedBy || []).some((k) => k !== r.key && eff[k] === true);
            const effective = eff[r.key] === true || fullOn;
            return (
              <div key={r.key} style={s.row}>
                <div style={{ minWidth: 0 }}>
                  <div style={s.label}>
                    <span style={s.mod}>{r.module.label}</span> · {r.label}
                  </div>
                  <div style={s.sub}>
                    Rol: {roleVal ? "sí" : "no"} · Efectivo:{" "}
                    <strong style={{ color: effective ? theme.ACCENT : theme.DANGER }}>
                      {effective ? (fullOn && eff[r.key] !== true ? "sí (por otro permiso)" : "sí") : "no"}
                    </strong>
                  </div>
                </div>
                <div style={s.seg}>
                  {OPTIONS.map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => setKey(r.key, o.v)}
                      style={{
                        ...s.segBtn,
                        ...(cur === o.v
                          ? o.v === true
                            ? s.segGrant
                            : o.v === false
                              ? s.segDeny
                              : s.segRole
                          : {}),
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={s.footer}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Guardar excepciones
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

const s = {
  wrap: { display: "grid", gap: theme.SPACE_3 },
  hint: { color: theme.SLATE, fontSize: theme.FS_SM, lineHeight: 1.5 },
  list: { display: "grid", gap: 6, maxHeight: "55vh", overflowY: "auto" },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    padding: "8px 10px",
    border: `1px solid ${theme.BORDER_SOFT}`,
    borderRadius: theme.RADIUS_SM,
    flexWrap: "wrap",
  },
  label: { color: theme.TEXT, fontWeight: theme.FW_SEMIBOLD, fontSize: theme.FS_SM },
  mod: { color: theme.SLATE },
  sub: { color: theme.SLATE, fontSize: theme.FS_XS, marginTop: 2 },
  seg: { display: "inline-flex", border: `1px solid ${theme.BORDER}`, borderRadius: theme.RADIUS_PILL, overflow: "hidden" },
  segBtn: {
    border: "none",
    background: theme.SURFACE,
    padding: "5px 10px",
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_BOLD,
    color: theme.SLATE,
    cursor: "pointer",
  },
  segRole: { background: theme.SURFACE_INSET, color: theme.TEXT },
  segGrant: { background: theme.ACCENT, color: "#fff" },
  segDeny: { background: theme.DANGER, color: "#fff" },
  footer: { display: "flex", justifyContent: "flex-end", gap: theme.SPACE_2 },
};
