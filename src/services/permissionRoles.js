// Roles de permisos (colección permission_roles) — lectura y escritura desde Desk.
//
// Solo un dev escribe (firestore.rules). El trigger permRolesRoleSync propaga
// cada cambio de permisos del rol a sus usuarios; acá además se escribe el
// efectivo del perfil al asignar un rol para que el cambio se vea al instante.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { boolMap, computeEffective, deriveOverrides } from "../config/permRoles";

const COL = "permission_roles";

/** Escucha todos los roles, ordenados. */
export function listenPermissionRoles(onRows, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy("orden", "asc")),
    (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function createPermissionRole({ nombre, descripcion = "", permisos = {}, orden = 100 }) {
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("El rol necesita un nombre.");
  const ref = await addDoc(collection(db, COL), {
    nombre: clean,
    descripcion: String(descripcion || "").trim(),
    permisos: boolMap(permisos),
    orden: Number(orden) || 100,
    activo: true,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || null,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  });
  return ref.id;
}

export async function updatePermissionRole(roleId, patch) {
  const data = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null };
  if (patch.nombre != null) data.nombre = String(patch.nombre).trim();
  if (patch.descripcion != null) data.descripcion = String(patch.descripcion).trim();
  if (patch.permisos != null) data.permisos = boolMap(patch.permisos);
  if (patch.orden != null) data.orden = Number(patch.orden) || 100;
  await updateDoc(doc(db, COL, roleId), data);
}

/** Borra un rol solo si no tiene usuarios asignados. */
export async function deletePermissionRole(roleId) {
  const used = await getDocs(query(collection(db, "profiles"), where("permRoleId", "==", roleId)));
  if (!used.empty) {
    throw new Error(`El rol tiene ${used.size} usuario(s) asignado(s). Reasignalos antes de borrarlo.`);
  }
  await deleteDoc(doc(db, COL, roleId));
}

/**
 * Asigna un rol a uno o varios perfiles.
 *
 * mode "conservar": las excepciones se calculan para que cada usuario siga
 *   viendo EXACTAMENTE lo que ve hoy (migración sin sorpresas).
 * mode "rol": el usuario queda igual al rol (sin excepciones).
 *
 * @param {Array<{ id: string, permisos?: object }>} profiles
 * @param {{ id: string, permisos: object } | null} role  null = quitar rol (vuelve a modo manual)
 * @param {"conservar"|"rol"} mode
 */
export async function assignRoleToProfiles(profiles, role, mode = "conservar") {
  let batch = writeBatch(db);
  let n = 0;
  for (const p of profiles) {
    const ref = doc(db, "profiles", p.id);
    if (!role) {
      batch.update(ref, { permRoleId: null, permisosOverrides: {}, updatedAt: serverTimestamp() });
    } else {
      const overrides = mode === "conservar" ? deriveOverrides(p.permisos || {}, role.permisos || {}) : {};
      batch.update(ref, {
        permRoleId: role.id,
        permisosOverrides: overrides,
        permisos: computeEffective(role.permisos || {}, overrides),
        updatedAt: serverTimestamp(),
      });
    }
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

/** Guarda las excepciones de un usuario con rol (y su efectivo). */
export async function saveProfileOverrides(profileId, role, overrides) {
  const clean = deriveOverrides(computeEffective(role?.permisos || {}, overrides), role?.permisos || {});
  await updateDoc(doc(db, "profiles", profileId), {
    permisosOverrides: clean,
    permisos: computeEffective(role?.permisos || {}, clean),
    updatedAt: serverTimestamp(),
  });
}
