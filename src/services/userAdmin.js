// Acciones administrativas sobre usuarios que requieren el Admin SDK (Cloud Functions).
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const adminDeleteUserFn = httpsCallable(functions, "adminDeleteUser");
const adminCreateUserFn = httpsCallable(functions, "adminCreateUser");

/**
 * Crea un usuario (cuenta de acceso + perfil + almacenes). Solo dev.
 * Devuelve { uid, email, username, tempPassword, emailSent, emailError }.
 * La contraseña temporal se muestra una sola vez.
 */
export async function createUserAccount(input) {
  try {
    const res = await adminCreateUserFn(input);
    return res.data;
  } catch (e) {
    throw new Error(e?.message || "No se pudo crear el usuario.");
  }
}

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
