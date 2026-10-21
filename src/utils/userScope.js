// Scope de datos de un usuario: almacenes asignados y almacén activo.
//
// En profiles/{uid}:
//   - bodegaIds: almacenes asignados (pueden ser de distintos países y compañías).
//                Solo los asigna un usuario dev.
//   - tenantId, company, bodegaId, bodegaNombre: el almacén ACTIVO. Todo lo que el
//                usuario crea y ve pertenece a este scope; los datos de cada
//                país/compañía nunca se comparten.
//
// El ID de un almacén es <tenant>-<company>-<CODE>, así que país y compañía se
// derivan del propio ID aunque el catálogo no esté disponible.

/** "CR-OLO-CLIRO" → { tenantId: "CR", company: "OLO", code: "CLIRO" } (o null). */
export function parseBodegaId(id) {
  const m = String(id || "").trim().match(/^([A-Z]{2,5})-([A-Z0-9]{2,10})-([A-Z0-9]{2,20})$/);
  return m ? { tenantId: m[1], company: m[2], code: m[3] } : null;
}

/** Almacenes asignados al perfil (bodegaIds ∪ almacén activo), sin duplicados. */
export function assignedBodegaIds(profile) {
  const ids = Array.isArray(profile?.bodegaIds) ? profile.bodegaIds : [];
  const all = [...ids, profile?.bodegaId].map((x) => String(x || "").trim()).filter(Boolean);
  return [...new Set(all)];
}

/**
 * Resuelve IDs a objetos de almacén usando el catálogo. Un ID que no esté en el
 * catálogo se conserva (derivando país/compañía del ID) para no perder acceso.
 */
export function resolveBodegas(ids, catalog) {
  const byId = new Map((catalog?.bodegas || []).map((b) => [b.id, b]));
  return ids
    .map((id) => {
      const known = byId.get(id);
      if (known) return known;
      const parsed = parseBodegaId(id);
      return parsed
        ? { id, tenantId: parsed.tenantId, companyId: parsed.company, code: parsed.code, name: id, active: true, unknown: true }
        : null;
    })
    .filter(Boolean);
}

/** Agrupa almacenes por país y compañía, en orden estable. */
export function groupBodegasByScope(bodegas, catalog) {
  const tenantName = new Map((catalog?.tenants || []).map((t) => [t.id, t.name]));
  const companyName = new Map((catalog?.companies || []).map((c) => [c.id, c.name]));
  const groups = new Map();
  bodegas.forEach((b) => {
    const key = `${b.tenantId}·${b.companyId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        tenantId: b.tenantId,
        tenantName: tenantName.get(b.tenantId) || b.tenantId,
        companyId: b.companyId,
        companyName: companyName.get(b.companyId) || b.companyId,
        bodegas: [],
      });
    }
    groups.get(key).bodegas.push(b);
  });
  return [...groups.values()]
    .map((g) => ({ ...g, bodegas: g.bodegas.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName) || a.companyName.localeCompare(b.companyName));
}

/** Campos del almacén activo para guardar en el perfil. */
export function scopePatchFor(bodega) {
  if (!bodega) return { tenantId: null, company: null, bodegaId: null, bodegaNombre: null };
  return { tenantId: bodega.tenantId, company: bodega.companyId, bodegaId: bodega.id, bodegaNombre: bodega.name };
}

/**
 * Patch de asignación que guarda un dev en UserHub.
 * - selectedIds: almacenes asignados.
 * - activeId: almacén activo; debe estar entre los asignados. Si no viene, se usa
 *   el primero asignado. Sin asignaciones, el usuario queda sin scope (no puede
 *   entrar hasta que se le asigne uno).
 * @throws {Error} si activeId no está entre los asignados.
 */
export function buildAssignmentPatch(selectedIds, activeId, catalog) {
  const ids = [...new Set((selectedIds || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (activeId && !ids.includes(activeId)) {
    throw new Error("El almacén activo tiene que estar entre los asignados.");
  }
  const bodegas = resolveBodegas(ids, catalog);
  const active = bodegas.find((b) => b.id === (activeId || ids[0])) || null;
  return { bodegaIds: ids, ...scopePatchFor(active) };
}

/** Texto corto del scope: "Costa Rica · OLO · CLIRO". */
export function scopeLabel(bodega, catalog) {
  if (!bodega) return "Sin almacén";
  const tenant = (catalog?.tenants || []).find((t) => t.id === bodega.tenantId)?.name || bodega.tenantId;
  return `${tenant} · ${bodega.companyId} · ${bodega.name}`;
}
