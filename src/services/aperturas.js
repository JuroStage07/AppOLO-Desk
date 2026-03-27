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
import { listenAperturasRecepcionFinalizadas } from "./aperturasRecepcion";

// ----------------------------------------------------
// Helpers (opcionales)
const mapSnap = (qs) => qs.docs.map((d) => ({ id: d.id, ...d.data() }));

function mergeFinalizadasLists(rowsA, rowsR) {
  const tagged = [
    ...rowsA.map((x) => ({ ...x, __sourceCollection: "aperturas" })),
    ...rowsR.map((x) => ({ ...x, __sourceCollection: "aperturasRecepcion" })),
  ];
  const byId = new Map();
  for (const x of tagged) {
    const id = String(x.id);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, x);
      continue;
    }
    if (prev.__sourceCollection === "aperturas") continue;
    if (x.__sourceCollection === "aperturas") byId.set(id, x);
  }
  return [...byId.values()];
}

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

/**
 * Une `aperturas` y `aperturasRecepcion` (mismo criterio estado finalizada, sin orderBy).
 * Cada ítem incluye `__sourceCollection` para que detalle y updates usen la colección correcta.
 */
export function listenAperturasFinalizadasGlobal(cb) {
  let readyA = false;
  let readyR = false;
  let listA = [];
  let listR = [];

  const emit = () => {
    if (!readyA || !readyR) return;
    cb(mergeFinalizadasLists(listA, listR));
  };

  const qy = query(collection(db, "aperturas"), where("estado", "==", "finalizada"));
  const unsubA = onSnapshot(qy, (qs) => {
    listA = mapSnap(qs);
    readyA = true;
    emit();
  });

  const unsubR = listenAperturasRecepcionFinalizadas((rows) => {
    listR = rows;
    readyR = true;
    emit();
  });

  return () => {
    unsubA?.();
    unsubR?.();
  };
}

/**
 * Detalle: escucha ambos paths; prioriza `aperturas` si el mismo id existiera en ambos.
 */
export function listenApertura(apId, cb) {
  const id = String(apId);
  const refA = doc(db, "aperturas", id);
  const refR = doc(db, "aperturasRecepcion", id);
  let readyA = false;
  let readyR = false;
  let existsA = false;
  let dataA = null;
  let existsR = false;
  let dataR = null;

  const emit = () => {
    if (!readyA || !readyR) return;
    if (existsA) {
      cb({ id, ...dataA, __sourceCollection: "aperturas" });
      return;
    }
    if (existsR) {
      cb({ id, ...dataR, __sourceCollection: "aperturasRecepcion" });
      return;
    }
    cb(null);
  };

  const unsubA = onSnapshot(refA, (snap) => {
    readyA = true;
    existsA = snap.exists();
    dataA = snap.exists() ? snap.data() : null;
    emit();
  });
  const unsubR = onSnapshot(refR, (snap) => {
    readyR = true;
    existsR = snap.exists();
    dataR = snap.exists() ? snap.data() : null;
    emit();
  });

  return () => {
    unsubA();
    unsubR();
  };
}