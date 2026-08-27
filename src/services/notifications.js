/**
 * Notificaciones — capa de acceso a Firestore.
 *
 * Colección `notifications`. Genérica y multi-módulo: no sabe nada de OTs ni de
 * mantenimiento. Cada documento describe su propio origen (`type`), su entidad
 * relacionada (`entityType` + `entityId`) y a dónde navegar (`actionPath`), así
 * que cualquier módulo puede emitir notificaciones sin tocar este archivo.
 *
 * Las notificaciones las CREA el backend (Cloud Functions, Admin SDK): ver
 * `functions/scheduledMaintenance.js` y el bloque `match /notifications/{id}`
 * de firestore.rules. Desde el cliente solo se leen las propias y se marca
 * leído/no leído; así persisten a refresh y se generan aunque la app esté cerrada.
 */
import {
  collection,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";

export const NOTIFICATIONS_COLLECTION = "notifications";

/** Tope de notificaciones traídas al panel (las más recientes). */
export const NOTIFICATIONS_PAGE_SIZE = 50;

/** Firestore admite 500 operaciones por batch. */
const BATCH_MAX = 450;

/** Normaliza un documento de Firestore a la forma que consume la UI. */
export function normalizeNotification(id, data) {
  const d = data || {};
  return {
    id,
    type: String(d.type || "generic"),
    title: String(d.title || ""),
    message: String(d.message || ""),
    entityType: d.entityType || null,
    entityId: d.entityId || null,
    actionPath: d.actionPath || "",
    metadata: d.metadata && typeof d.metadata === "object" ? d.metadata : {},
    read: d.read === true,
    readAt: d.readAt || null,
    createdAt: d.createdAt || null,
    createdAtMs:
      d.createdAt?.toMillis?.() ??
      (typeof d.createdAt === "number" ? d.createdAt : null),
    targetUserId: d.targetUserId || "",
    tenantId: d.tenantId || "",
    company: d.company || "",
    bodegaId: d.bodegaId || "",
    bodegaNombre: d.bodegaNombre || "",
  };
}

/**
 * Suscripción en tiempo real a las notificaciones del usuario.
 * Requiere el índice compuesto `notifications(targetUserId, createdAt desc)`.
 *
 * @param {string} uid
 * @param {(rows: Array<ReturnType<typeof normalizeNotification>>) => void} onData
 * @param {(err: unknown) => void} [onError]
 * @param {{ max?: number }} [options]
 * @returns {() => void} unsubscribe
 */
export function subscribeToMyNotifications(uid, onData, onError, options = {}) {
  const max = Number(options.max) || NOTIFICATIONS_PAGE_SIZE;
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where("targetUserId", "==", uid),
    orderBy("createdAt", "desc"),
    fsLimit(max)
  );

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => normalizeNotification(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

/** Marca una notificación como leída / no leída. */
export function setNotificationRead(notificationId, read = true) {
  return updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    read: read === true,
    readAt: read === true ? serverTimestamp() : null,
  });
}

/**
 * Marca como leídas varias notificaciones en lotes.
 * @param {string[]} notificationIds
 */
export async function markNotificationsRead(notificationIds) {
  const ids = (Array.isArray(notificationIds) ? notificationIds : []).filter(Boolean);
  if (ids.length === 0) return 0;

  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_MAX)) {
      batch.update(doc(db, NOTIFICATIONS_COLLECTION, id), {
        read: true,
        readAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return ids.length;
}
