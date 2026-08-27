/**
 * Catálogos compartidos del flujo de OTs.
 *
 * Estas lecturas estaban duplicadas dentro de las páginas (`OTsPage.jsx` tenía
 * los dos listados de personal, `OTsSolDetallePage.jsx` el catálogo global de
 * subtareas). Al necesitarlas también el formulario de mantenimiento programado
 * se centralizan acá para no volver a copiarlas.
 */
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { db } from "../firebase";

/**
 * Personal habilitado para ejecutar una OT: rol admin/dev o `permisos.mantenimiento`.
 * Espeja el helper `canMantenimientoOT()` de firestore.rules.
 */
export function profileIsMantenimientoStaff(data) {
  if (!data || typeof data !== "object") return false;
  if (data.active === false) return false;
  const role = data.role;
  if (role === "administrativo" || role === "dev") return true;
  return data.permisos != null && data.permisos.mantenimiento === true;
}

/** Solo permiso explícito de mantenimiento (sin override de admin/dev). */
export function profileHasMantenimientoPermiso(data) {
  if (!data || typeof data !== "object") return false;
  if (data.active === false) return false;
  return data.permisos != null && data.permisos.mantenimiento === true;
}

export function displayNameFromProfile(uid, data) {
  const d = data || {};
  const s =
    (d.displayName && String(d.displayName).trim()) ||
    (d.username && String(d.username).trim()) ||
    (d.email && String(d.email).trim()) ||
    "";
  return s || uid;
}

/**
 * Lee `profiles` y devuelve los perfiles que cumplen `predicate`, acotados al
 * tenant/company del solicitante. Los perfiles sin tenant/company propios se
 * mantienen (compatibilidad con documentos legados, igual que en dataScope).
 */
async function fetchProfilesBy(predicate, tenantId, company) {
  const snap = await getDocs(collection(db, "profiles"));
  const rows = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!predicate(data)) return;
    if (tenantId && data.tenantId && data.tenantId !== tenantId) return;
    if (company && data.company && data.company !== company) return;
    rows.push({
      uid: docSnap.id,
      displayName: displayNameFromProfile(docSnap.id, data),
      numeroFicha: (data.numeroFicha && String(data.numeroFicha)) || "",
      role: data.role || "",
    });
  });
  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" })
  );
  return rows;
}

/** Candidatos a responsable de una OT (mantenimiento, admin o dev). */
export function fetchMantenimientoResponsables(tenantId, company) {
  return fetchProfilesBy(profileIsMantenimientoStaff, tenantId, company);
}

/** Listado restringido a `permisos.mantenimiento` (filtro de la columna En proceso). */
export function fetchProfilesMantenimientoPermiso(tenantId, company) {
  return fetchProfilesBy(profileHasMantenimientoPermiso, tenantId, company);
}

/** Etiqueta de un ítem del catálogo global de subtareas (`subtaskList`). */
export function subtaskCatalogItemLabel(item) {
  if (!item || typeof item !== "object") return "";
  return String(item.name ?? item.title ?? "").trim();
}

/** Catálogo global de subtareas activas (`subtaskList`, `active !== false`). */
export async function fetchActiveSubtaskCatalog(max = 100) {
  const ref = collection(db, "subtaskList");
  const snap = await getDocs(query(ref, orderBy("name"), limit(max)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((item) => item.active !== false);
}
