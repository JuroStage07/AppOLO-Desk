// Roles de permisos — cálculo en el cliente (espejo de functions/permRolesCore.js).
//
// El servidor (trigger permRolesProfileSync) recalcula y es la fuente de verdad;
// el cliente usa lo mismo para mostrar el efectivo al instante y para escribir
// un perfil ya consistente. Mantener ambos archivos alineados.

export function boolMap(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  for (const [k, v] of Object.entries(m)) {
    if (typeof k === "string" && k) out[k] = v === true;
  }
  return out;
}

/** Permiso efectivo = rol pisado por las excepciones del usuario. */
export function computeEffective(rolePermisos, overrides) {
  return { ...boolMap(rolePermisos), ...boolMap(overrides) };
}

/** Excepciones mínimas para que (rol + excepciones) == edited. */
export function deriveOverrides(edited, rolePermisos) {
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

export function hashPermisos(m) {
  return Object.entries(boolMap(m))
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");
}
