// MRP Tarimas — acceso por perfil. Dos ejes independientes:
//
//  • SECCIONES (estructural): los perfiles restringidos — `profile.epaAdmin ===
//    true` — solo ven un subconjunto fijo del módulo: Dashboard, todo Inventario
//    (Artículos, Insumos y En Cliente / Tienda) e Historial › Historial de
//    movimientos. Catálogos, Descartes, Registro de eventos y Registro de
//    insumos quedan fuera y NO se habilitan con permisos.
//    Además, algunas secciones exigen su propio permiso a cualquier perfil
//    (MRP_PATH_PERMISSIONS): hoy Inventario › Insumos requiere `mrpInsumos`,
//    también para los perfiles restringidos.
//
//  • ESCRITURA (por permiso): registrar ajustes o traslados exige los permisos
//    `mrpAjustes` / `mrpTraslados`. Los perfiles restringidos no tienen override
//    por rol: sin el permiso explícito el módulo es de solo lectura.
//
// El gating de MRP vive en el cliente (igual que el resto del módulo, ver
// services/mrp/catalogos.js): route guard + estas funciones.
import { hasExplicitPermission, isAdminRole } from "./permissions";

export const MRP_BASE = "/mrp-tarimas";

/** Ruta de aterrizaje cuando se bloquea una sección del módulo. */
export const MRP_HOME = "/mrp-tarimas/dashboard";

/** Rutas del módulo permitidas a un perfil restringido (epaAdmin). */
export const MRP_RESTRICTED_PATHS = [
  "/mrp-tarimas",
  "/mrp-tarimas/dashboard",
  "/mrp-tarimas/inventario",
  "/mrp-tarimas/inventario/articulos",
  // Insumos queda además sujeto al permiso `mrpInsumos` (MRP_PATH_PERMISSIONS).
  "/mrp-tarimas/inventario/insumos",
  "/mrp-tarimas/inventario/tiendas",
  "/mrp-tarimas/movimientos",
];

/**
 * Secciones del módulo que exigen un permiso propio, además del `mrpTarimas`
 * que da entrada al módulo. Aplica a todos los perfiles (el rol admin sigue
 * siendo override, como en el resto de la app).
 */
export const MRP_PATH_PERMISSIONS = {
  "/mrp-tarimas/inventario/insumos": "mrpInsumos",
};

const normalizePath = (path) => String(path || "").replace(/\/+$/, "") || "/";

const permisosOf = (ctx = {}) => ctx.permisos || ctx.profile?.permisos || {};

/**
 * Perfil con acceso recortado al MRP. Hoy es la bandera `epaAdmin`, la misma que
 * usa EpaAdminRouteGuard, por lo que la restricción no depende del rol.
 */
export function isMrpRestrictedProfile({ profile, epaAdmin } = {}) {
  if (epaAdmin === true) return true;
  const flag = profile?.epaAdmin;
  return flag === true || String(flag || "").toLowerCase() === "true";
}

/** ¿La ruta pertenece al módulo MRP Tarimas? */
export function isMrpPath(pathname) {
  const path = normalizePath(pathname);
  return path === MRP_BASE || path.startsWith(`${MRP_BASE}/`);
}

/**
 * ¿La sección exige un permiso propio (MRP_PATH_PERMISSIONS) y el perfil lo
 * tiene? Rol admin es override; el resto necesita el permiso explícito.
 */
function hasSectionPermission(path, ctx = {}) {
  const permKey = MRP_PATH_PERMISSIONS[path];
  if (!permKey) return true;
  if (hasExplicitPermission(permisosOf(ctx), permKey)) return true;
  if (isMrpRestrictedProfile(ctx)) return false;
  return isAdminRole(ctx.role);
}

/**
 * Gate de sección. Dos recortes: los perfiles restringidos solo ven
 * MRP_RESTRICTED_PATHS, y cualquier perfil necesita el permiso de la sección
 * cuando esta lo exige (MRP_PATH_PERMISSIONS). Fuera de eso, el acceso al
 * módulo lo decide el permiso `mrpTarimas` (routeAccess / workAreas).
 */
export function canAccessMrpPath(pathname, ctx = {}) {
  if (!isMrpPath(pathname)) return true;
  const path = normalizePath(pathname);
  if (!hasSectionPermission(path, ctx)) return false;
  if (!isMrpRestrictedProfile(ctx)) return true;
  return MRP_RESTRICTED_PATHS.includes(path);
}

/** Puede ver el inventario de insumos (permiso `mrpInsumos`). */
export function canMrpInsumos(ctx = {}) {
  return canAccessMrpPath("/mrp-tarimas/inventario/insumos", ctx);
}

/**
 * Capacidad de escritura. Con el permiso explícito siempre se concede. Los
 * perfiles restringidos se quedan ahí (sin override por rol). Para el resto se
 * mantiene el comportamiento previo a estos permisos: quien entra al módulo
 * (rol admin o permiso `mrpTarimas`) podía ajustar y trasladar.
 */
function canMrpWrite(ctx = {}, permKey) {
  const permisos = permisosOf(ctx);
  if (hasExplicitPermission(permisos, permKey)) return true;
  if (isMrpRestrictedProfile(ctx)) return false;
  return isAdminRole(ctx.role) || hasExplicitPermission(permisos, "mrpTarimas");
}

/** Puede registrar ajustes de inventario (permiso `mrpAjustes`). */
export function canMrpAjustes(ctx = {}) {
  return canMrpWrite(ctx, "mrpAjustes");
}

/** Puede registrar traslados de artículos y entre almacenes (`mrpTraslados`). */
export function canMrpTraslados(ctx = {}) {
  return canMrpWrite(ctx, "mrpTraslados");
}
