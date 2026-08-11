export const ROLE_OPTIONS = [
  {
    key: "dev",
    label: "Desarrollo",
    description: "Acceso completo, herramientas internas y administracion avanzada.",
  },
  {
    key: "administrativo",
    label: "Administrativo",
    description: "Acceso administrativo general. No incluye herramientas dev.",
  },
  {
    key: "operativo",
    label: "Operativo",
    description: "Acceso solo a los modulos marcados en permisos.",
  },
];

export const ROLE_KEYS = ROLE_OPTIONS.map((role) => role.key);
export const ADMIN_ROLES = ["administrativo", "dev"];

export const PERMISSION_GROUPS = [
  "Operaciones",
  "Seguridad",
  "Mantenimiento",
  "Servicios",
  "Administracion",
];

export const PERMISSION_OPTIONS = [
  {
    key: "despacho",
    label: "Despacho",
    group: "Operaciones",
    description: "Despachos en progreso e historial finalizado.",
  },
  {
    key: "recepcion",
    label: "Recepcion operativa",
    group: "Operaciones",
    description: "Acciones de descarga y seguimiento operativo de recepcion.",
  },
  {
    key: "recepcionReportes",
    label: "Reportes Recepcion",
    group: "Operaciones",
    description: "Metricas, tendencias y exportes de recepcion.",
  },
  {
    key: "canRecepcionCofersa",
    label: "Recepcion Cofersa",
    group: "Operaciones",
    description: "Flujos y datos de recepcion Cofersa.",
  },
  {
    key: "despachosEPA",
    label: "Recepcion EPA",
    group: "Operaciones",
    description: "Flujos EPA usados por recepcion y aperturas EPA.",
  },
  {
    key: "saludOcupacional",
    label: "Seguridad",
    group: "Seguridad",
    description: "Aperturas, marcas, terceros, visados y reportes de seguridad.",
  },
  {
    key: "documentacion",
    label: "Documentacion",
    group: "Seguridad",
    description: "Biblioteca documental de la plataforma.",
  },
  {
    key: "epa",
    label: "Panel EPA",
    group: "Seguridad",
    description: "Modulo EPA y aperturas finalizadas EPA.",
  },
  {
    key: "mantenimiento",
    label: "Mantenimiento",
    group: "Mantenimiento",
    description: "Equipos, solicitudes OT, tablero, dashboard y finalizadas.",
  },
  {
    key: "serviciosGenerales",
    label: "Servicios generales",
    group: "Servicios",
    description: "OTs y validacion de ingreso de Servicios Generales.",
  },
  {
    key: "boletasSalida",
    label: "Boletas de salida",
    group: "Servicios",
    description: "Generar, validar y consultar boletas de salida de vehiculos.",
  },
  {
    key: "pesajeTarimas",
    label: "Pesaje tarimas",
    group: "Servicios",
    description: "Registro y consulta de pesajes de tarimas.",
  },
  {
    key: "mrpTarimas",
    label: "MRP Tarimas",
    group: "Servicios",
    description: "Dashboard, inventario, reparaciones y materiales de tarimas.",
  },
  {
    key: "mrpAjustes",
    label: "MRP Ajustes",
    group: "Servicios",
    description: "Registrar ajustes de inventario en MRP Tarimas. Sin este permiso el modulo es de solo lectura.",
  },
  {
    key: "mrpTraslados",
    label: "MRP Traslados",
    group: "Servicios",
    description: "Registrar traslados de articulos y entre almacenes en MRP Tarimas.",
  },
  {
    key: "horasExtra",
    label: "Horas extra",
    group: "Administracion",
    description: "Aprobaciones, reportes y gestion del modulo de horas extra.",
  },
  {
    key: "gestionUsuarios",
    label: "Gestion de usuarios",
    group: "Administracion",
    description: "Administrar roles, tenant, company y permisos de usuarios.",
  },
];

export const PERMISSION_KEYS = PERMISSION_OPTIONS.map((perm) => perm.key);
export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_OPTIONS.map((perm) => [perm.key, perm.label])
);

const PERMISSION_ALIASES = {
  zoneFranca: "pesajeTarimas",
  zonaFranca: "pesajeTarimas",
};

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function isDevRole(role) {
  return role === "dev";
}

function permissionMapFrom(source) {
  if (!source) return {};
  if (source.permisos && typeof source.permisos === "object") return source.permisos;
  return source;
}

export function hasExplicitPermission(source, key) {
  const permisos = permissionMapFrom(source);
  if (permisos?.[key] === true) return true;

  return Object.entries(PERMISSION_ALIASES).some(
    ([legacyKey, canonicalKey]) => canonicalKey === key && permisos?.[legacyKey] === true
  );
}

export function normalizePermissionMap(source = {}) {
  const permisos = permissionMapFrom(source);
  const normalized = {};

  for (const key of PERMISSION_KEYS) {
    normalized[key] = hasExplicitPermission(permisos, key);
  }

  return normalized;
}

export function canAccessByRoleOrPermission(
  { role, permisos, profile } = {},
  { roles = [], allowedRoles = [], anyPerms = [], allPerms = [], adminOverride = true } = {}
) {
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) return false;
  if (roles.includes(role)) return true;
  if (adminOverride && isAdminRole(role)) return true;

  const effectivePermisos = permisos || profile?.permisos || {};
  const anyList = Array.isArray(anyPerms) ? anyPerms.filter(Boolean) : [];
  const allList = Array.isArray(allPerms) ? allPerms.filter(Boolean) : [];

  if (anyList.length > 0 && !anyList.some((key) => hasExplicitPermission(effectivePermisos, key))) {
    return false;
  }

  if (allList.length > 0 && !allList.every((key) => hasExplicitPermission(effectivePermisos, key))) {
    return false;
  }

  return anyList.length > 0 || allList.length > 0 || roles.length === 0;
}

export function canAccessWorkItem(item = {}, context = {}) {
  const { role } = context;

  if (item.devOnly) return isDevRole(role);
  if (item.adminOnly) return isAdminRole(role);

  const anyPerms = item.anyPerms || (item.requiredPerm ? [item.requiredPerm] : []);
  const allPerms = item.allPerms || [];

  return canAccessByRoleOrPermission(context, {
    roles: item.roles || [],
    allowedRoles: item.allowedRoles || [],
    anyPerms,
    allPerms,
    adminOverride: item.adminOverride !== false,
  });
}

export function permissionLabel(key) {
  return PERMISSION_LABELS[key] || key;
}
