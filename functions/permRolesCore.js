/**
 * Núcleo puro de los «roles de permisos» (matriz permisos × roles).
 *
 * Modelo:
 *   permission_roles/{roleId}.permisos      → mapa { clave: bool } del rol.
 *   profiles/{uid}.permRoleId               → rol de permisos asignado (opcional).
 *   profiles/{uid}.permisosOverrides        → excepciones del usuario { clave: bool }
 *                                             (true = conceder, false = quitar).
 *   profiles/{uid}.permisos                 → permiso EFECTIVO materializado
 *                                             (rol + excepciones). Es lo único que
 *                                             leen las reglas, Desk y la app móvil.
 *   profiles/{uid}.permisosSync             → { hash, roleId, at } del último cálculo.
 *
 * Los perfiles sin permRoleId no se tocan (modo legado: permisos a mano).
 * Mismo cálculo en el cliente: src/config/permRoles.js (mantener alineados).
 */

/** @param {unknown} m */
function boolMap(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  for (const [k, v] of Object.entries(m)) {
    if (typeof k === "string" && k) out[k] = v === true;
  }
  return out;
}

/**
 * Permiso efectivo = rol, pisado por las excepciones del usuario.
 * @param {Record<string, boolean>} rolePermisos
 * @param {Record<string, boolean>} overrides
 * @returns {Record<string, boolean>}
 */
function computeEffective(rolePermisos, overrides) {
  const role = boolMap(rolePermisos);
  const ov = boolMap(overrides);
  return { ...role, ...ov };
}

/**
 * Excepciones mínimas para que (rol + excepciones) == `edited`.
 * Se usa cuando alguien editó `permisos` directamente (p. ej. la pantalla de
 * usuarios de la app móvil): su cambio se conserva como excepción.
 * @returns {Record<string, boolean>}
 */
function deriveOverrides(edited, rolePermisos) {
  const e = boolMap(edited);
  const r = boolMap(rolePermisos);
  const out = {};
  for (const k of new Set([...Object.keys(e), ...Object.keys(r)])) {
    const ev = e[k] === true;
    const rv = r[k] === true;
    if (ev !== rv) out[k] = ev;
  }
  return out;
}

/** Huella estable de un mapa de permisos (solo cuenta las claves en true). */
function hashPermisos(m) {
  return Object.entries(boolMap(m))
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");
}

function sameBoolMap(a, b) {
  const x = boolMap(a);
  const y = boolMap(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if ((x[k] === true) !== (y[k] === true)) return false;
  return true;
}

/**
 * Decide qué escribir en un perfil tras un cambio. Devuelve `null` si no hay
 * nada que hacer (evita bucles: la escritura propia no vuelve a escribir).
 *
 * @param {{ before?: object|null, after: object, rolePermisos: Record<string, boolean> }} p
 * @returns {null | { permisos: Record<string, boolean>, permisosOverrides: Record<string, boolean>, hash: string }}
 */
function planProfileSync({ before, after, rolePermisos }) {
  if (!after || !after.permRoleId) return null;
  const current = after.permisos || {};
  const syncedHash = after.permisosSync && after.permisosSync.hash;
  const roleChanged = !before || before.permRoleId !== after.permRoleId;
  const permisosChanged = !before || !sameBoolMap(before.permisos, current);

  let overrides = boolMap(after.permisosOverrides);
  // Alguien cambió `permisos` a mano (sin pasar por excepciones) y no fue el
  // propio cálculo: se respeta convirtiéndolo en excepciones.
  const editedByHand =
    permisosChanged && syncedHash != null && hashPermisos(current) !== syncedHash && !roleChanged;
  if (editedByHand) overrides = deriveOverrides(current, rolePermisos);
  else overrides = deriveOverrides(computeEffective(rolePermisos, overrides), rolePermisos);

  const permisos = computeEffective(rolePermisos, overrides);
  const hash = hashPermisos(permisos);
  if (
    sameBoolMap(permisos, current) &&
    syncedHash === hash &&
    sameBoolMap(overrides, after.permisosOverrides) &&
    (after.permisosSync && after.permisosSync.roleId) === after.permRoleId
  ) {
    return null;
  }
  return { permisos, permisosOverrides: overrides, hash };
}

module.exports = {
  boolMap,
  computeEffective,
  deriveOverrides,
  hashPermisos,
  sameBoolMap,
  planProfileSync,
};
