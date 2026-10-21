// Acciones administrativas sobre usuarios que requieren el Admin SDK (Cloud Functions).
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const adminDeleteUserFn = httpsCallable(functions, "adminDeleteUser");

/**
 * Elimina el usuario (cuenta de acceso + perfil), no sus registros. Solo dev.
 * El perfil queda archivado en profiles_deleted/{uid} por si hay que restaurarlo.
 * @param {string} uid
 * @param {string} confirmEmail  correo del usuario, como doble confirmación
 */
export async function deleteUserAccount(uid, confirmEmail) {
  try {
    const res = await adminDeleteUserFn({ uid, confirmEmail });
    return res.data;
  } catch (e) {
    throw new Error(e?.message || "No se pudo eliminar el usuario.");
  }
}
