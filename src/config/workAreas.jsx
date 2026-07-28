import React from "react";
import {
  ArrowRight,
  Clock,
  ClipboardList,
  Code2,
  HeartPulse,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import imgSalud from "../assets/saludOcupacional.png";
import imgDespacho from "../assets/despacho.png";
import imgMantenimiento from "../assets/mantenimiento.png";
import imgRecepcion from "../assets/recepcion.png";
import imgServiciosGenerales from "../assets/serviciosGenerales.png";
import imgEpa from "../assets/epa.png";
import imgDev from "../assets/dev.png";
import { canAccessWorkItem } from "./permissions";

/**
 * Single source of truth for the application "Áreas de trabajo".
 *
 * Consumed by:
 *  - AreasTrabajoHubPage (cards + search)
 *  - AreasSidebar (the global drawer mounted in every Topbar)
 *
 * Keeping the data here guarantees the hub and the sidebar never drift apart.
 */

// Color de marca único para todas las áreas (sin color propio por área).
const BRAND_THEME = { accent: "#00C3AE", soft: "rgba(0, 195, 174, 0.12)" };

export const AREA_THEMES = {
  despacho: BRAND_THEME,
  seguridad: BRAND_THEME,
  "salud-ocupacional": BRAND_THEME,
  recepcion: BRAND_THEME,
  mantenimiento: BRAND_THEME,
  "servicios-generales": BRAND_THEME,
  epa: BRAND_THEME,
  administracion: BRAND_THEME,
  dev: BRAND_THEME,
  "mrp-tarimas": BRAND_THEME,
};

/**
 * Hierarchical nav: Área › Módulo › Feature.
 * `modules` is the source of truth for the sidebar tree. A module may carry
 * `features` (a third level). The flat `subModules` list (used by the hub
 * search, command palette and breadcrumbs) is DERIVED from `modules` below, so
 * there is a single source of truth — edit `modules`, not `subModules`.
 */
const RAW_AREAS = [
  {
    key: "despacho",
    title: "Despacho",
    desc: "Coordinación de carga, asignación de docks y seguimiento de despachos en tiempo real.",
    path: "/despacho",
    img: imgDespacho,
    theme: AREA_THEMES.despacho,
    tag: "Operación",
    icon: <Zap size={18} strokeWidth={2} />,
    requiredPerm: "despacho",
    blocked: false,
    blockedDesc: "Acceso al módulo deshabilitado temporalmente.",
    modules: [
      { label: "En progreso", path: "/despacho/in-progress" },
      { label: "Finalizados", path: "/despacho/finalizados" },
    ],
  },
  {
    key: "seguridad",
    title: "Seguridad",
    desc: "Gestión de visados, control de ingreso de terceros y registros de seguridad.",
    path: "/seguridad",
    theme: AREA_THEMES.seguridad,
    tag: "Seguridad",
    icon: <Shield size={18} strokeWidth={2} />,
    anyPerms: ["saludOcupacional", "documentacion"],
    modules: [
      {
        label: "Control de marcas",
        path: "/seguridad/control-marcas",
        requiredPerm: "saludOcupacional",
        features: [
          { label: "Historial", path: "/seguridad/control-marcas/historial", requiredPerm: "saludOcupacional" },
        ],
      },
      {
        label: "Aperturas",
        path: "/seguridad/aperturas",
        requiredPerm: "saludOcupacional",
        features: [
          { label: "Finalizadas", path: "/seguridad/aperturas/finalizadas", requiredPerm: "saludOcupacional" },
          { label: "Rechazadas", path: "/seguridad/aperturas/rechazadas", requiredPerm: "saludOcupacional" },
        ],
      },
      {
        label: "Visados",
        path: "/seguridad/visado",
        requiredPerm: "saludOcupacional",
        features: [
          { label: "Generar visado", path: "/seguridad/visado/generar", requiredPerm: "saludOcupacional" },
          { label: "Administrar visados", path: "/seguridad/visados", requiredPerm: "saludOcupacional" },
        ],
      },
      { label: "Documentación", path: "/documentacion", anyPerms: ["documentacion", "saludOcupacional"] },
      { label: "Reportes Seguridad", path: "/seguridad/metricas", requiredPerm: "saludOcupacional" },
    ],
  },
  {
    key: "salud-ocupacional",
    title: "Salud Ocupacional",
    desc: "Bienestar, exámenes y seguimiento de salud del personal.",
    path: "/salud-ocupacional",
    img: imgSalud,
    theme: AREA_THEMES["salud-ocupacional"],
    tag: "Próximamente",
    icon: <HeartPulse size={18} strokeWidth={2} />,
    comingSoon: true,
    comingSoonMsg:
      "El área de Salud Ocupacional estará disponible próximamente. Los módulos de visados, control de ingreso de terceros y aperturas ahora viven en el área de Seguridad.",
    modules: [],
  },
  {
    key: "recepcion",
    title: "Recepción",
    desc: "Registro de ingresos, validación documental y trazabilidad de mercadería.",
    path: "/recepcion",
    img: imgRecepcion,
    theme: AREA_THEMES.recepcion,
    tag: "Inbound",
    icon: <ArrowRight size={18} strokeWidth={2} />,
    anyPerms: ["recepcion", "recepcionReportes", "canRecepcionCofersa", "despachosEPA"],
    modules: [
      { label: "Acción descarga", path: "/recepcion/accion-descarga", anyPerms: ["recepcion", "canRecepcionCofersa", "despachosEPA"] },
      { label: "Reportes de Descarga", path: "/recepcion/metricas", anyPerms: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"] },
      { label: "Reportes de Recepción", path: "/recepcion/metricas-recepcion", anyPerms: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"] },
    ],
  },
  {
    key: "mantenimiento",
    title: "Mantenimiento",
    desc: "Control de equipos, checklists preventivos y gestión de fallas correctivas.",
    path: "/mantenimiento",
    img: imgMantenimiento,
    theme: AREA_THEMES.mantenimiento,
    tag: "Mantenimiento",
    icon: <Clock size={18} strokeWidth={2} />,
    requiredPerm: "mantenimiento",
    modules: [
      { label: "Equipos", path: "/mantenimiento/equipos" },
      {
        label: "Órdenes de trabajo",
        path: "/mantenimiento/ots",
        features: [
          { label: "Tablero / Gestión", path: "/mantenimiento/OTsPage" },
          { label: "Finalizadas", path: "/mantenimiento/ots/finalizadas" },
          { label: "Dashboard", path: "/mantenimiento/ots/dashboard" },
        ],
      },
    ],
  },
  {
    key: "servicios-generales",
    title: "Servicios Generales",
    desc: "Solicitudes internas, seguimiento de tareas y control de servicios de planta.",
    path: "/servicios-generales",
    img: imgServiciosGenerales,
    theme: AREA_THEMES["servicios-generales"],
    tag: "Servicios",
    icon: <Sparkles size={18} strokeWidth={2} />,
    anyPerms: ["serviciosGenerales", "pesajeTarimas"],
    modules: [
      {
        label: "Órdenes de trabajo",
        path: "/servicios-generales/ordenes-trabajo",
        requiredPerm: "serviciosGenerales",
        features: [
          { label: "Crear OT", path: "/servicios-generales/ordenes-trabajo/crear", requiredPerm: "serviciosGenerales" },
          { label: "Gestión de OTs", path: "/servicios-generales/ordenes-trabajo/gestion", requiredPerm: "serviciosGenerales" },
        ],
      },
      { label: "Validar ingreso", path: "/servicios-generales/validar-ingreso", requiredPerm: "serviciosGenerales" },
      {
        label: "Pesaje tarimas",
        path: "/servicios-generales/pesaje-tarimas",
        requiredPerm: "pesajeTarimas",
        features: [
          { label: "Registrar tarimas", path: "/servicios-generales/pesaje-tarimas/registrar", requiredPerm: "pesajeTarimas" },
          { label: "Consultar tarimas", path: "/servicios-generales/pesaje-tarimas/consultar", requiredPerm: "pesajeTarimas" },
        ],
      },
    ],
  },
  {
    key: "epa",
    title: "EPA",
    desc: "Panel exclusivo EPA: aperturas, reportes y administración centralizada.",
    path: "/epa",
    img: imgEpa,
    theme: AREA_THEMES.epa,
    tag: "EPA",
    icon: <LayoutDashboard size={18} strokeWidth={2} />,
    anyPerms: ["epa", "despachosEPA"],
    modules: [
      { label: "Aperturas finalizadas", path: "/epa/aperturas-finalizadas" },
    ],
  },
  {
    key: "mrp-tarimas",
    title: "MRP Tarimas",
    desc: "Gestión de tarimas.",
    path: "/mrp-tarimas",
    theme: AREA_THEMES["mrp-tarimas"],
    tag: "MRP",
    icon: <ClipboardList size={18} strokeWidth={2} />,
    requiredPerm: "mrpTarimas",
    modules: [
      { label: "Dashboard", path: "/mrp-tarimas/dashboard", requiredPerm: "mrpTarimas" },
      { label: "Inventario", path: "/mrp-tarimas/inventario", requiredPerm: "mrpTarimas" },
      { label: "Historial", path: "/mrp-tarimas/movimientos", requiredPerm: "mrpTarimas" },
      { label: "Descartes", path: "/mrp-tarimas/descartes", requiredPerm: "mrpTarimas" },
      { label: "Catálogos", path: "/mrp-tarimas/catalogos", requiredPerm: "mrpTarimas" },
    ],
  },
  {
    key: "administracion",
    title: "Administración",
    desc: "Gestión de usuarios, roles y permisos de la plataforma.",
    path: "/administracion",
    theme: AREA_THEMES.administracion,
    tag: "Administración",
    icon: <ShieldCheck size={18} strokeWidth={2} />,
    adminOnly: true,
    modules: [
      { label: "Usuarios", path: "/administracion/usuarios", roles: ["dev"], allowedRoles: ["administrativo", "dev"], anyPerms: ["gestionUsuarios"], adminOverride: false },
      {
        label: "Horas Extra",
        path: "/horas-extra",
        allowedRoles: ["administrativo", "dev"],
        requiredPerm: "horasExtra",
        features: [
          { label: "Aprobaciones gerencia", path: "/horas-extra/gerencia", requiredPerm: "horasExtra" },
          { label: "Reporte mensual", path: "/horas-extra/reporte", requiredPerm: "horasExtra" },
        ],
      },
    ],
  },
  {
    key: "dev",
    title: "Dev",
    desc: "Herramientas internas de desarrollo: migraciones, sincronización y utilidades.",
    path: "/dev",
    img: imgDev,
    theme: AREA_THEMES.dev,
    tag: "Desarrollo",
    icon: <Code2 size={18} strokeWidth={2} />,
    devOnly: true,
    modules: [
      { label: "Update AppOLO Supabase", path: "/dev/update-supabase" },
      { label: "Despachos Dev", path: "/dev/despachos-dev" },
      {
        label: "Configuración de módulos",
        path: "/dev/config-modulos",
        features: [
          { label: "Horas Extra", path: "/dev/config-modulos/horas-extra" },
        ],
      },
    ],
  },
];

/** Flatten modules + their features into the legacy flat `subModules` list. */
function flattenModules(modules = []) {
  const out = [];
  for (const m of modules) {
    if (m.path) out.push({ label: m.label, path: m.path });
    for (const f of m.features || []) {
      out.push({ label: f.label, path: f.path });
    }
  }
  return out;
}

export const WORK_AREAS = RAW_AREAS.map((area) => ({
  ...area,
  subModules: flattenModules(area.modules),
}));

function hasAccessGate(item = {}) {
  return Boolean(
    item.devOnly ||
      item.adminOnly ||
      item.requiredPerm ||
      item.anyPerms ||
      item.allPerms ||
      item.roles ||
      item.allowedRoles
  );
}

function inheritAccessGate(item = {}, parentGate = null) {
  if (!parentGate || hasAccessGate(item)) return item;

  return {
    ...item,
    devOnly: parentGate.devOnly,
    adminOnly: parentGate.adminOnly,
    roles: parentGate.roles,
    allowedRoles: parentGate.allowedRoles,
    requiredPerm: parentGate.requiredPerm,
    anyPerms: parentGate.anyPerms,
    allPerms: parentGate.allPerms,
    adminOverride: parentGate.adminOverride,
  };
}

function filterModulesForAccess(modules = [], context = {}, parentGate = null) {
  return modules
    .map((module) => {
      const accessModule = inheritAccessGate(module, parentGate);
      const features = filterModulesForAccess(module.features || [], context, accessModule);
      const allowed = canAccessWorkItem(accessModule, context);

      if (!allowed && features.length === 0) return null;
      return { ...module, features };
    })
    .filter(Boolean);
}

function filterAreaForAccess(area, context) {
  const modules = filterModulesForAccess(area.modules || [], context, area);
  const allowed = canAccessWorkItem(area, context);

  if (!allowed && modules.length === 0) return null;

  return {
    ...area,
    modules,
    subModules: flattenModules(modules),
  };
}

/**
 * Filter the areas a given user is allowed to see.
 *  - epaOnly users only see the EPA area.
 *  - devOnly areas require role "dev".
 *  - adminOnly areas require role "administrativo" or "dev".
 *  - requiredPerm / anyPerms gate operational users by profile.permisos.
 */
export function getVisibleAreas({ epaOnly = false, role = null, permisos = {}, profile = null } = {}) {
  if (epaOnly) {
    return WORK_AREAS.filter((a) => a.key === "epa");
  }

  const context = { role, permisos, profile };
  return WORK_AREAS.map((area) => filterAreaForAccess(area, context)).filter(Boolean);
}
