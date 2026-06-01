import React from "react";
import {
  ArrowRight,
  Clock,
  Code2,
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

/**
 * Single source of truth for the application "Áreas de trabajo".
 *
 * Consumed by:
 *  - AreasTrabajoHubPage (cards + search)
 *  - AreasSidebar (the global drawer mounted in every Topbar)
 *
 * Keeping the data here guarantees the hub and the sidebar never drift apart.
 */

export const AREA_THEMES = {
  despacho: { accent: "#16A34A", soft: "rgba(22, 163, 74, 0.12)" },
  salud: { accent: "#2563EB", soft: "rgba(37, 99, 235, 0.12)" },
  recepcion: { accent: "#65A30D", soft: "rgba(101, 163, 13, 0.12)" },
  mantenimiento: { accent: "#7C3AED", soft: "rgba(124, 58, 237, 0.12)" },
  "servicios-generales": { accent: "#EA580C", soft: "rgba(234, 88, 12, 0.12)" },
  epa: { accent: "#6D28D9", soft: "rgba(109, 40, 217, 0.12)" },
  administracion: { accent: "#0891B2", soft: "rgba(8, 145, 178, 0.12)" },
  dev: { accent: "#475569", soft: "rgba(71, 85, 105, 0.12)" },
};

export const WORK_AREAS = [
  {
    key: "despacho",
    title: "Despacho",
    desc: "Coordinación de carga, asignación de docks y seguimiento de despachos en tiempo real.",
    path: "/despacho",
    img: imgDespacho,
    theme: AREA_THEMES.despacho,
    tag: "Operación",
    icon: <Zap size={18} strokeWidth={2} />,
    blocked: false,
    blockedDesc: "Acceso al módulo deshabilitado temporalmente.",
    subModules: [
      { label: "En progreso", path: "/despacho/in-progress" },
      { label: "Finalizados", path: "/despacho/finalizados" },
    ],
  },
  {
    key: "salud",
    title: "Salud Ocupacional",
    desc: "Gestión de visados, control de ingreso de terceros y registros de seguridad.",
    path: "/salud",
    img: imgSalud,
    theme: AREA_THEMES.salud,
    tag: "Seguridad",
    icon: <Shield size={18} strokeWidth={2} />,
    subModules: [
      { label: "Control de marcas", path: "/salud/control-marcas" },
      { label: "Historial marcas", path: "/salud/control-marcas/historial" },
      { label: "Aperturas", path: "/salud/aperturas" },
      { label: "Aperturas finalizadas", path: "/salud/aperturas/finalizadas" },
      { label: "Aperturas rechazadas", path: "/salud/aperturas/rechazadas" },
      { label: "Visados", path: "/salud/visados" },
      { label: "Generar visado", path: "/salud/visado/generar" },
      { label: "Documentación", path: "/documentacion" },
      { label: "Métricas", path: "/salud/metricas" },
    ],
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
    subModules: [
      { label: "Acción descarga", path: "/recepcion/accion-descarga" },
      { label: "Métricas", path: "/recepcion/metricas" },
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
    subModules: [
      { label: "Equipos", path: "/mantenimiento/equipos" },
      { label: "Órdenes de trabajo", path: "/mantenimiento/ots" },
      { label: "Gestión OTs", path: "/mantenimiento/OTsPage" },
      { label: "OTs finalizadas", path: "/mantenimiento/ots/finalizadas" },
      { label: "Dashboard OTs", path: "/mantenimiento/ots/dashboard" },
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
    subModules: [
      { label: "Órdenes de trabajo", path: "/servicios-generales/ordenes-trabajo" },
      { label: "Crear OT", path: "/servicios-generales/ordenes-trabajo/crear" },
      { label: "Gestión de OTs", path: "/servicios-generales/ordenes-trabajo/gestion" },
      { label: "Validar ingreso", path: "/servicios-generales/validar-ingreso" },
      { label: "Pesaje tarimas", path: "/servicios-generales/pesaje-tarimas" },
      { label: "Registrar tarimas", path: "/servicios-generales/pesaje-tarimas/registrar" },
      { label: "Consultar tarimas", path: "/servicios-generales/pesaje-tarimas/consultar" },
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
    subModules: [
      { label: "Aperturas finalizadas", path: "/epa/aperturas-finalizadas" },
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
    subModules: [
      { label: "Usuarios", path: "/administracion/usuarios" },
      { label: "Horas Extra", path: "/horas-extra" },
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
    subModules: [
      { label: "Update AppOLO Supabase", path: "/dev/update-supabase" },
      { label: "Configuración de módulos", path: "/dev/config-modulos" },
    ],
  },
];

/**
 * Filter the areas a given user is allowed to see.
 *  - epaOnly users only see the EPA area.
 *  - devOnly areas require role "dev".
 *  - adminOnly areas require role "admin" or "dev".
 */
export function getVisibleAreas({ epaOnly = false, role = null } = {}) {
  if (epaOnly) {
    return WORK_AREAS.filter((a) => a.key === "epa");
  }
  return WORK_AREAS.filter((a) => {
    if (a.devOnly && role !== "dev") return false;
    if (a.adminOnly && role !== "administrativo" && role !== "dev") return false;
    return true;
  });
}
