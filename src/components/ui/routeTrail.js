import { WORK_AREAS } from "../../config/workAreas";

/**
 * Pure route → breadcrumb-trail resolution, shared by <Breadcrumbs/> and
 * <Topbar/>. Kept in a plain module (no components) so importing it doesn't
 * break React Fast Refresh.
 *
 * The trail is Inicio › Área › (Sección…) › (Detalle), built from these inputs:
 *  - WORK_AREAS subModules + EXTRA_SECTIONS = the area's known sections.
 *  - Path nesting — every section whose path prefixes the current path is
 *    included, deepest last (e.g. Aperturas › Aperturas finalizadas).
 *  - SECTION_PARENTS — explicit parent when URLs don't nest by prefix (e.g.
 *    Administrar visados /seguridad/visados under the Visados hub /seguridad/visado).
 *  - SECTION_LABELS — breadcrumb-only label overrides.
 *  - LEAF_LABELS — labels for dynamic detail routes (/…/:id).
 */

export const ROOT_PATHS = new Set([
  "/",
  "/areas",
  "/welcome",
  "/login",
  "/config-region",
]);

export function isRootPath(pathname) {
  return ROOT_PATHS.has(pathname);
}

/**
 * Section/hub routes that exist in the app but aren't listed as subModules in
 * workAreas (so the breadcrumb wouldn't otherwise know their label). Registering
 * one also lets deeper routes nest under it by URL prefix.
 *   `area` = the owning area's path.
 */
const EXTRA_SECTIONS = [
  // Horas Extra sub-pages (the "Horas Extra" subModule lives under Administración).
  { path: "/horas-extra/gerencia", label: "Aprobaciones gerencia", area: "/administracion" },
  { path: "/horas-extra/reporte", label: "Reporte mensual", area: "/administracion" },
  { path: "/horas-extra/usuarios", label: "Usuarios", area: "/administracion" },
  // Dev: overtime settings nested under "Configuración de módulos".
  { path: "/dev/config-modulos/horas-extra", label: "Horas Extra", area: "/dev" },
  // Salud: equipment-review route (not in the sidebar).
  { path: "/seguridad/equipos", label: "Revisión de equipos", area: "/seguridad" },
  // Top-level weighing shortcut (alias of /servicios-generales/pesaje-tarimas).
  { path: "/pesado", label: "Pesaje tarimas", area: "/servicios-generales" },
];

/**
 * Logical parent for sections whose URL does not nest under their parent's URL.
 * Key = section/leaf path; value = the parent section path (same area).
 */
const SECTION_PARENTS = {
  "/mantenimiento/OTsPage": "/mantenimiento/ots", // Gestión OTs → Órdenes de trabajo
  "/seguridad/visados": "/seguridad/visado", // Administrar visados → Visados (hub)
};

/**
 * Breadcrumb-only label overrides — when the workAreas/sidebar label isn't ideal
 * in the trail. Key = path; value = label shown in the breadcrumb. (Empty now;
 * kept as the extension point for relabels that shouldn't touch the sidebar.)
 */
const SECTION_LABELS = {};

// Labels for deep/detail routes not present in workAreas subModules.
// `parent` (optional) = a section path to insert before the leaf crumb.
const LEAF_LABELS = [
  { prefix: "/seguridad/aperturas/detalle/", label: "Detalle de apertura" },
  {
    prefix: "/mantenimiento/ots-solicitud/",
    label: "Detalle de OT",
    parent: "/mantenimiento/ots",
  },
  { prefix: "/mantenimiento/equipos/", label: "Detalle de equipo" },
  { prefix: "/recepcion/accion-descarga/", label: "Detalle de acción" },
];

const matchesPath = (pathname, path) =>
  pathname === path || pathname.startsWith(path + "/");

/** All breadcrumb-able sections of an area: its subModules + any extras. */
const areaSections = (area) => [
  ...(area.subModules || []).map((s) => ({ label: s.label, path: s.path })),
  ...EXTRA_SECTIONS.filter((e) => e.area === area.path).map((e) => ({
    label: e.label,
    path: e.path,
  })),
];

const findSection = (area, path) =>
  areaSections(area).find((s) => s.path === path) || null;

/**
 * Current page label for `document.title`, reusing the same resolution as the
 * breadcrumb: the deepest crumb of the trail. Returns null for root/unknown
 * paths so callers can fall back to the plain app name.
 */
export function resolvePageTitle(pathname) {
  const trail = resolveTrail(pathname);
  if (!trail.length) return null;
  const last = trail[trail.length - 1];
  // "Inicio" is the home crumb; not a meaningful page title on its own.
  if (last.home) return null;
  return last.label || null;
}

export function resolveTrail(pathname) {
  if (isRootPath(pathname)) return [];

  // Best area by path prefix.
  let bestArea = null;
  let bestAreaLen = -1;
  for (const area of WORK_AREAS) {
    if (matchesPath(pathname, area.path) && area.path.length > bestAreaLen) {
      bestArea = area;
      bestAreaLen = area.path.length;
    }
  }

  // Best (longest) matching section across all areas — also resolves the owning
  // area for sections whose path doesn't share the area prefix (e.g.
  // /documentacion under Salud, /horas-extra under Administración).
  let ownerArea = null;
  let leafLen = -1;
  for (const area of WORK_AREAS) {
    for (const s of areaSections(area)) {
      if (matchesPath(pathname, s.path) && s.path.length > leafLen) {
        ownerArea = area;
        leafLen = s.path.length;
      }
    }
  }

  const area = ownerArea || bestArea;
  if (!area) return [];

  const trail = [{ label: "Inicio", path: "/", home: true }];
  trail.push({ label: area.title, path: area.path });

  // Chain of nested sections of the owning area (deepest last).
  const chain = areaSections(area)
    .filter((s) => matchesPath(pathname, s.path))
    .sort((a, b) => a.path.length - b.path.length);

  const seen = new Set();
  const pushSection = (sec) => {
    if (sec && !seen.has(sec.path)) {
      seen.add(sec.path);
      trail.push({ label: SECTION_LABELS[sec.path] || sec.label, path: sec.path });
    }
  };

  for (const sec of chain) {
    const parentPath = SECTION_PARENTS[sec.path];
    if (parentPath) pushSection(findSection(area, parentPath));
    pushSection(sec);
  }

  // Leaf/detail crumb for deep routes not represented by a section.
  const deepest = seen.size ? trail[trail.length - 1].path : area.path;
  if (pathname !== deepest && pathname.startsWith(deepest)) {
    const leaf = LEAF_LABELS.find((l) => pathname.startsWith(l.prefix));
    if (leaf) {
      if (leaf.parent) pushSection(findSection(area, leaf.parent));
      trail.push({ label: leaf.label, path: pathname });
    }
  }

  return trail;
}
