// Catálogo de permisos por módulo y por botón (fuente única de la matriz).
//
// Cada módulo:
//   key, label, group
//   fullKey  → permiso de «acceso total» del módulo (el de siempre). Puede ser null.
//   actions  → botones/acciones con su propia clave.
//
// Cada acción:
//   key       → clave en profiles.permisos (la lee Desk y la app móvil).
//   label/desc
//   apps      → dónde se aplica hoy: "desk" y/o "movil".
//   impliedBy → claves que YA dan esta acción (compatibilidad: quien hoy entra al
//               módulo conserva sus botones). Por defecto [fullKey].
//   roles     → roles del sistema que la tienen siempre. Por defecto
//               administrativo y dev; ["dev"] para lo que hoy es solo dev.
//
// Para restringir un botón a un rol: en la matriz quitá el «Acceso total» del
// módulo y marcá solo las acciones que correspondan.
//
// Al agregar una clave: firestore.rules → validPermisosMap (lista hasOnly).

// Sin imports de ./permissions (permissions.js importa este archivo).
const isAdminRole = (role) => role === "administrativo" || role === "dev";

const DESK = ["desk"];
const MOVIL = ["movil"];
const AMBAS = ["desk", "movil"];

export const PERMISSION_CATALOG = [
  // ─── Operaciones ──────────────────────────────────────────────────────
  {
    key: "despacho",
    label: "Despacho",
    group: "Operaciones",
    fullKey: "despacho",
    actions: [
      { key: "despachoCrear", label: "Nuevo despacho", apps: MOVIL },
      { key: "despachoEditar", label: "Editar despacho", apps: MOVIL },
      { key: "despachoFotos", label: "Fotos y escaneo de tarimas", desc: "Tomar, mover y borrar fotos / slots", apps: MOVIL },
      { key: "despachoChofer", label: "Asignar chofer / choferes", apps: MOVIL },
      { key: "despachoFinalizar", label: "Finalizar despacho", apps: MOVIL },
      { key: "despachoReabrir", label: "Reabrir despacho", apps: MOVIL },
      { key: "despachoEliminar", label: "Eliminar despacho", apps: MOVIL },
      { key: "despachoMrpReintentar", label: "Reintentar traslado MRP", apps: MOVIL },
      { key: "despachoCargaRealtime", label: "Carga en tiempo real", apps: DESK },
      { key: "despachoReporte", label: "Reporte de despachos", apps: DESK },
      { key: "despachoExportar", label: "Exportar (PDF / Excel)", desc: "Detalle y reporte", apps: DESK },
    ],
  },
  {
    key: "recepcion",
    label: "Recepción operativa",
    group: "Operaciones",
    fullKey: "recepcion",
    actions: [
      {
        key: "recepcionAperturaCrear",
        label: "Crear apertura de recepción",
        apps: MOVIL,
        impliedBy: ["recepcion", "despachosEPA", "canRecepcionCofersa"],
      },
      {
        key: "recepcionDescarga",
        label: "Iniciar / pausar / finalizar descarga (móvil)",
        apps: MOVIL,
        impliedBy: ["recepcion", "despachosEPA", "canRecepcionCofersa"],
      },
      { key: "recepcionDescargaDesk", label: "Controlar descarga desde Desk", apps: DESK, impliedBy: [] },
      {
        key: "recepcionRecepcion",
        label: "Iniciar / finalizar recepción",
        apps: MOVIL,
        impliedBy: ["recepcion", "despachosEPA", "canRecepcionCofersa"],
      },
      { key: "recepcionEliminar", label: "Eliminar acciones de descarga", apps: DESK, impliedBy: [], roles: ["dev"] },
    ],
  },
  {
    key: "recepcionReportes",
    label: "Reportes de recepción",
    group: "Operaciones",
    fullKey: "recepcionReportes",
    actions: [
      {
        key: "recepcionExportar",
        label: "Exportar métricas (CSV / Excel)",
        apps: DESK,
        impliedBy: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"],
      },
    ],
  },
  {
    key: "cofersa",
    label: "Recepción Cofersa",
    group: "Operaciones",
    fullKey: "canRecepcionCofersa",
    actions: [
      { key: "cofersaLotes", label: "Crear / eliminar lotes", apps: MOVIL },
      { key: "cofersaFotos", label: "Fotos de facturas", apps: MOVIL },
      { key: "cofersaConsolidar", label: "Consolidar facturas", apps: MOVIL },
    ],
  },
  { key: "despachosEPA", label: "Recepción EPA", group: "Operaciones", fullKey: "despachosEPA", actions: [] },

  // ─── Seguridad ────────────────────────────────────────────────────────
  {
    key: "seguridad",
    label: "Seguridad",
    group: "Seguridad",
    fullKey: "saludOcupacional",
    actions: [
      { key: "segAperturaCrear", label: "Nueva apertura", apps: MOVIL },
      {
        key: "segAperturaGestionar",
        label: "Iniciar / finalizar / reabrir apertura",
        desc: "Incluye formularios, fotos RF y revisión RS",
        apps: AMBAS,
        impliedBy: ["saludOcupacional", "epa", "despachosEPA"],
      },
      { key: "segAperturaRechazar", label: "Rechazar apertura", apps: AMBAS, impliedBy: ["saludOcupacional", "epa", "despachosEPA"] },
      { key: "segAperturaEliminar", label: "Eliminar apertura", apps: MOVIL },
      { key: "segMarcas", label: "Registrar marcas de terceros", apps: DESK },
      { key: "segTerceros", label: "Crear / editar / bloquear terceros", apps: MOVIL },
      { key: "segGafetes", label: "Enviar gafetes por correo", apps: MOVIL },
      { key: "segVisadosCrear", label: "Nuevo visado", apps: DESK },
      { key: "segVisadosFirmar", label: "Firmar visados", apps: MOVIL },
      { key: "segVisadosPdf", label: "Generar PDF de visado", apps: DESK },
      { key: "segExportar", label: "Descargar fotos / historial", apps: DESK },
      { key: "segEquiposChecklist", label: "Checklist y fallas de equipos", apps: MOVIL, impliedBy: ["saludOcupacional", "mantenimiento"] },
    ],
  },
  // Documentación: subir/editar/eliminar sigue siendo por rol (administrativo/dev)
  // porque lo exigen firestore.rules y storage; sumar botones aquí requiere
  // cambiar esas reglas primero.
  { key: "documentacion", label: "Documentación", group: "Seguridad", fullKey: "documentacion", actions: [] },
  { key: "epa", label: "Panel EPA", group: "Seguridad", fullKey: "epa", actions: [] },

  // ─── Mantenimiento ────────────────────────────────────────────────────
  {
    key: "ots",
    label: "Órdenes de trabajo",
    group: "Mantenimiento",
    fullKey: "mantenimiento",
    actions: [
      { key: "otsVer", label: "Ver OTs", apps: AMBAS },
      { key: "otsCrear", label: "Crear OT", apps: AMBAS },
      { key: "otsGestionar", label: "Gestionar (asignar, mover, subtareas, notas)", apps: AMBAS },
      { key: "otsFinalizar", label: "Finalizar OT", apps: AMBAS },
      { key: "otsEliminar", label: "Eliminar OT", apps: AMBAS },
      { key: "otsProgramado", label: "Mantenimiento programado", apps: DESK },
    ],
  },
  {
    key: "equipos",
    label: "Equipos",
    group: "Mantenimiento",
    fullKey: null,
    actions: [
      { key: "equiposCrear", label: "Agregar equipo", apps: DESK, impliedBy: ["mantenimiento"] },
      { key: "equiposEditar", label: "Editar / cambiar estado / fallas", apps: DESK, impliedBy: ["mantenimiento"] },
      { key: "equiposQr", label: "Enviar QR por correo", apps: DESK, impliedBy: ["mantenimiento"] },
    ],
  },

  // ─── Servicios ────────────────────────────────────────────────────────
  { key: "serviciosGenerales", label: "Servicios generales", group: "Servicios", fullKey: "serviciosGenerales", actions: [] },
  {
    key: "boletas",
    label: "Boletas de salida",
    group: "Servicios",
    fullKey: null,
    actions: [
      { key: "boletasSalida", label: "Generar / consultar boletas", apps: AMBAS, impliedBy: [] },
      { key: "boletasValidar", label: "Validar boleta (firma)", apps: AMBAS, impliedBy: [] },
      { key: "boletasRechazar", label: "Rechazar boleta", apps: DESK, impliedBy: ["boletasSalida", "boletasValidar"] },
    ],
  },
  {
    key: "pesaje",
    label: "Pesaje de tarimas",
    group: "Servicios",
    fullKey: "pesajeTarimas",
    actions: [{ key: "pesajeRegistrar", label: "Registrar pesaje", apps: DESK }],
  },
  {
    key: "mrp",
    label: "MRP Tarimas",
    group: "Servicios",
    fullKey: null,
    actions: [
      { key: "mrpTarimas", label: "Ver MRP (dashboard e inventario)", apps: DESK, impliedBy: [] },
      { key: "mrpInsumos", label: "Inventario de insumos", apps: DESK, impliedBy: [] },
      { key: "mrpInsumosMovimientos", label: "Consumir / entrada-salida de insumos", apps: DESK, impliedBy: ["mrpInsumos"] },
      { key: "mrpAjustes", label: "Ajustes de inventario", apps: DESK, impliedBy: [] },
      { key: "mrpTraslados", label: "Traslados", apps: DESK, impliedBy: [] },
      { key: "mrpCatalogos", label: "Crear / editar / eliminar catálogos", apps: DESK, impliedBy: ["mrpTarimas"] },
      { key: "mrpExportar", label: "Exportar Excel", apps: DESK, impliedBy: ["mrpTarimas"] },
    ],
  },

  // ─── Administración ───────────────────────────────────────────────────
  {
    key: "horasExtra",
    label: "Horas extra",
    group: "Administración",
    fullKey: "horasExtra",
    actions: [
      { key: "heAprobar", label: "Aprobar / rechazar (control)", apps: DESK },
      { key: "heUsuarios", label: "Sincronizar / excluir / horarios", apps: DESK },
      { key: "heExportar", label: "Exportar Excel", apps: DESK },
    ],
  },
  // Crear / eliminar usuarios: solo dev (lo valida adminCreateUser / adminDeleteUser).
  { key: "usuarios", label: "Gestión de usuarios", group: "Administración", fullKey: "gestionUsuarios", actions: [] },
];

/** Índice clave de acción → { action, module }. */
export const ACTION_INDEX = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((m) =>
    m.actions.map((a) => [
      a.key,
      {
        module: m,
        action: {
          ...a,
          impliedBy: a.impliedBy ?? (m.fullKey ? [m.fullKey] : []),
          roles: a.roles ?? ["administrativo", "dev"],
        },
      },
    ])
  )
);

/** Todas las claves del catálogo (acceso total + acciones). */
export const CATALOG_KEYS = [
  ...new Set(PERMISSION_CATALOG.flatMap((m) => [m.fullKey, ...m.actions.map((a) => a.key)]).filter(Boolean)),
];

/** Etiqueta legible de una clave del catálogo. */
export const CATALOG_LABELS = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((m) => [
    ...(m.fullKey ? [[m.fullKey, `${m.label} (acceso total)`]] : []),
    ...m.actions.map((a) => [a.key, `${m.label} · ${a.label}`]),
  ])
);

/**
 * ¿Puede el usuario usar esta acción/botón?
 *   rol del sistema habilitado → sí · clave explícita → sí · clave que la implica → sí.
 * Para claves que no son acciones del catálogo, se comporta como un permiso
 * normal (admin o clave en true).
 *
 * @param {{ role?: string, permisos?: object, profile?: object }} ctx
 * @param {string} key
 */
export function canDo({ role, permisos, profile } = {}, key) {
  const perms = permisos || profile?.permisos || {};
  const entry = ACTION_INDEX[key];
  if (!entry) return isAdminRole(role) || perms[key] === true;
  const { action } = entry;
  if (action.roles.includes(role)) return true;
  if (perms[key] === true) return true;
  return action.impliedBy.some((k) => perms[k] === true);
}
