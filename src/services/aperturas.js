// services/aperturas.js (DASHBOARD WEB)
// ----------------------------------------------------
// Firestore
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
} from "firebase/firestore";

import { db } from "../firebase"; 

// ----------------------------------------------------
// Helpers (opcionales)
const mapSnap = (qs) => qs.docs.map((d) => ({ id: d.id, ...d.data() }));

// ----------------------------------------------------
// LISTENERS (lo que necesita el dashboard)

export function listenAperturasEnProceso(cb) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "en_proceso"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs)));
}

export function listenAperturasRechazadas(cb) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "rechazada"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs)));
}

export function listenAperturasFinalizadasGlobal(cb) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "finalizada"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs)));
}

// Detalle (para pantalla de detalle si la hacés luego)
export function listenApertura(apId, cb) {
  const dref = doc(db, "aperturas", apId);
  return onSnapshot(dref, (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: snap.id, ...snap.data() });
  });
}