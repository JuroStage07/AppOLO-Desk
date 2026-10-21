// Permisos por acción del módulo de Órdenes de Trabajo (Mantenimiento).
//
// Única fuente de verdad para Desk. Reglas:
//   - Rol administrativo o dev → todas las acciones.
//   - Permiso `mantenimiento` (acceso total, el de siempre) → todas las acciones.
//   - Si no, cada acción según su permiso (otsCrear, otsGestionar…).
//   - Cualquier acción implica poder VER las OTs.
// Las reglas de Firestore aplican lo mismo (firestore.rules: canOt*).
import { hasExplicitPermission, isAdminRole } from "./permissions";

export const OT_ACTION_KEYS = {
  ver: "otsVer",
  crear: "otsCrear",
  gestionar: "otsGestionar",
  finalizar: "otsFinalizar",
  eliminar: "otsEliminar",
  programado: "otsProgramado",
};

/** Permisos que habilitan entrar a algo de OTs (para rutas y menús). */
export const OT_ANY_PERMS = ["mantenimiento", ...Object.values(OT_ACTION_KEYS)];

/** @returns {{ ver, crear, gestionar, finalizar, eliminar, programado, full }} */
export function getOtAccess({ role, permisos, profile } = {}) {
  const perms = permisos || profile?.permisos || {};
  const full = isAdminRole(role) || hasExplicitPermission(perms, "mantenimiento");
  const access = { full };
  for (const [action, key] of Object.entries(OT_ACTION_KEYS)) {
    access[action] = full || hasExplicitPermission(perms, key);
  }
  access.ver = access.ver || Object.keys(OT_ACTION_KEYS).some((a) => access[a]);
  return access;
}
