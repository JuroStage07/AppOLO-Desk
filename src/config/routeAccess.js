export const ROUTE_ACCESS_RULES = [
  {
    path: "/seguridad/aperturas/detalle",
    anyPerms: ["saludOcupacional", "epa", "despachosEPA"],
    allowEpaAdmin: true,
  },
  { path: "/despacho", anyPerms: ["despacho"] },
  { path: "/documentacion", exact: true, anyPerms: ["documentacion", "saludOcupacional"] },
  { path: "/seguridad/control-marcas", anyPerms: ["saludOcupacional"] },
  { path: "/seguridad/aperturas", anyPerms: ["saludOcupacional"] },
  { path: "/seguridad/visado", anyPerms: ["saludOcupacional"] },
  { path: "/seguridad/visados", anyPerms: ["saludOcupacional"] },
  { path: "/seguridad/metricas", exact: true, anyPerms: ["saludOcupacional"] },
  { path: "/seguridad/equipos", exact: true, anyPerms: ["saludOcupacional"] },
  { path: "/seguridad", exact: true, anyPerms: ["saludOcupacional", "documentacion"] },
  { path: "/epa", anyPerms: ["epa", "despachosEPA"], allowEpaAdmin: true },
  { path: "/dev", roles: ["dev"], adminOverride: false },
  {
    path: "/administracion/usuarios",
    exact: true,
    roles: ["dev"],
    allowedRoles: ["administrativo", "dev"],
    anyPerms: ["gestionUsuarios"],
    adminOverride: false,
  },
  { path: "/servicios-generales/ordenes-trabajo", anyPerms: ["serviciosGenerales"] },
  { path: "/servicios-generales/validar-ingreso", exact: true, anyPerms: ["serviciosGenerales"] },
  { path: "/servicios-generales/boletas-salida", anyPerms: ["boletasSalida"] },
  { path: "/servicios-generales/pesaje-tarimas", anyPerms: ["pesajeTarimas"] },
  { path: "/servicios-generales", exact: true, anyPerms: ["serviciosGenerales", "pesajeTarimas", "boletasSalida"] },
  { path: "/pesado", exact: true, anyPerms: ["pesajeTarimas"] },
  { path: "/recepcion/accion-descarga", anyPerms: ["recepcion", "canRecepcionCofersa", "despachosEPA"] },
  { path: "/recepcion/metricas", exact: true, anyPerms: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"] },
  { path: "/recepcion", exact: true, anyPerms: ["recepcion", "recepcionReportes", "canRecepcionCofersa", "despachosEPA"] },
  { path: "/mantenimiento", anyPerms: ["mantenimiento"] },
  { path: "/mrp-tarimas", anyPerms: ["mrpTarimas"] },
  { path: "/horas-extra", allowedRoles: ["administrativo", "dev"], anyPerms: ["horasExtra"] },
];

function matchesRoute(rule, pathname) {
  if (rule.exact) return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

export function findRouteAccessRule(pathname) {
  return ROUTE_ACCESS_RULES.find((rule) => matchesRoute(rule, pathname)) || null;
}
