/**
 * Notificaciones del usuario activo: suscripción en tiempo real, contador de
 * pendientes y acciones de lectura.
 *
 * La persistencia vive en Firestore (`notifications`), no en estado local: el
 * hook solo refleja lo que hay en el servidor, así que las notificaciones
 * sobreviven a un refresh y se generan aunque la app esté cerrada.
 *
 * El estado se guarda junto al `uid` que lo produjo y los flags (`loading`) se
 * derivan de esa comparación. Así el efecto solo llama a setState desde los
 * callbacks de la suscripción, nunca de forma sincrónica en su cuerpo.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AuthCtx } from "../auth/AuthProvider";
import {
  markNotificationsRead,
  setNotificationRead,
  subscribeToMyNotifications,
} from "../services/notifications";

const EMPTY_ITEMS = [];

const LOAD_ERROR =
  "No se pudieron cargar las notificaciones. Revisá tu conexión o los índices de Firestore.";

export default function useNotifications(options = {}) {
  const authCtx = useContext(AuthCtx);
  const uid = authCtx?.user?.uid || "";
  const authLoading = !!authCtx?.loading;
  const max = options.max;

  /** Último snapshot recibido, etiquetado con el uid que lo generó. */
  const [snapshot, setSnapshot] = useState({
    uid: "",
    status: "idle",
    items: EMPTY_ITEMS,
    error: "",
  });

  useEffect(() => {
    if (authLoading || !uid) return undefined;

    const unsub = subscribeToMyNotifications(
      uid,
      (rows) => setSnapshot({ uid, status: "ready", items: rows, error: "" }),
      (err) => {
        console.error("useNotifications:", err);
        setSnapshot({ uid, status: "error", items: EMPTY_ITEMS, error: LOAD_ERROR });
      },
      max ? { max } : undefined
    );

    return () => unsub();
  }, [authLoading, uid, max]);

  // El snapshot solo vale si corresponde al usuario actual (evita mostrar datos
  // del usuario anterior tras un cambio de sesión).
  const isCurrent = Boolean(uid) && snapshot.uid === uid;
  const items = isCurrent ? snapshot.items : EMPTY_ITEMS;
  const error = isCurrent ? snapshot.error : "";
  const loading = authLoading || (Boolean(uid) && !isCurrent);

  const unreadCount = useMemo(
    () => items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [items]
  );

  const markRead = useCallback(async (notificationId, read = true) => {
    try {
      await setNotificationRead(notificationId, read);
      return true;
    } catch (err) {
      console.error("markRead:", err);
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return true;
    try {
      await markNotificationsRead(ids);
      return true;
    } catch (err) {
      console.error("markAllRead:", err);
      return false;
    }
  }, [items]);

  return { items, unreadCount, loading, error, markRead, markAllRead };
}
