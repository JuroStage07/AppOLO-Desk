// services/aperturas.js (DASHBOARD WEB)
// ----------------------------------------------------
// Firestore
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from "firebase/firestore";

import { db } from "../firebase";
import { listenAperturasRecepcionFinalizadas } from "./aperturasRecepcion";
import { filterByUserScope } from "../utils/dataScope";

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

// Nota: las reglas (sameTenantScopeData) exigen filtrar la query por tenantId+company.
// No usamos orderBy junto a esos filtros para no requerir un índice compuesto: ordenamos
// en memoria. La bodega se filtra en cliente (filterByUserScope), no en la query.
const byCreatedAtDesc = (a, b) => {
  const am = a?.createdAt?.toMillis?.() ?? 0;
  const bm = b?.createdAt?.toMillis?.() ?? 0;
  return bm - am;
};

export function listenAperturasEnProceso(cb, tenantId, company) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "en_proceso"),
    where("tenantId", "==", tenantId),
    where("company", "==", company)
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs).sort(byCreatedAtDesc)));
}

export function listenAperturasRechazadas(cb, tenantId, company) {
  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "rechazada"),
    where("tenantId", "==", tenantId),
    where("company", "==", company)
  );
  return onSnapshot(qy, (qs) => cb(mapSnap(qs).sort(byCreatedAtDesc)));
}

/**
 * Une `aperturas` y `aperturasRecepcion` (mismo criterio estado finalizada, sin orderBy).
 * Cada ítem incluye `__sourceCollection` para que detalle y updates usen la colección correcta.
 */
export function listenAperturasFinalizadasGlobal(cb, tenantId, company, onError, bodegaId) {
  let readyA = false;
  let readyR = false;
  let listA = [];
  let listR = [];

  const emit = () => {
    if (!readyA || !readyR) return;
    const merged = mergeFinalizadasLists(listA, listR);
    cb(filterByUserScope(merged, tenantId, company, bodegaId));
  };

  const qy = query(
    collection(db, "aperturas"),
    where("estado", "==", "finalizada"),
    where("tenantId", "==", tenantId),
    where("company", "==", company)
  );
  const unsubA = onSnapshot(
    qy,
    (qs) => {
      listA = mapSnap(qs);
      readyA = true;
      emit();
    },
    (err) => onError?.(err)
  );

  const unsubR = listenAperturasRecepcionFinalizadas(
    (rows) => {
      listR = rows;
      readyR = true;
      emit();
    },
    tenantId,
    company,
    onError
  );

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