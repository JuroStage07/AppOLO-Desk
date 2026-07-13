// services/aperturasRecepcion.js — colección paralela a `aperturas` (recepción / app móvil)
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";

import { db } from "../firebase";

const mapSnap = (qs) => qs.docs.map((d) => ({ id: d.id, ...d.data() }));

/**
 * Finalizadas en `aperturasRecepcion`. Sin orderBy para no excluir docs sin `createdAt`.
 * Las reglas (sameTenantScopeData) exigen filtrar por tenantId+company en la query.
 */
export function listenAperturasRecepcionFinalizadas(cb, tenantId, company, onError) {
  const qy = query(
    collection(db, "aperturasRecepcion"),
    where("estado", "==", "finalizada"),
    where("tenantId", "==", tenantId),
    where("company", "==", company)
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs)), (err) => onError?.(err));
}

export function listenAperturaRecepcion(apId, cb) {
  const dref = doc(db, "aperturasRecepcion", String(apId));
  return onSnapshot(dref, (snap) => {
    if (!snap.exists()) return cb(null);
    cb({
      id: snap.id,
      ...snap.data(),
      __sourceCollection: "aperturasRecepcion",
    });
  });
}
