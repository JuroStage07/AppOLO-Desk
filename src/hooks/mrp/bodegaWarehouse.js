// MRP Tarimas — almacén de trabajo resuelto desde la BODEGA activa.
//
// El módulo ya NO selecciona el almacén a mano. La bodega activa
// (profiles/{uid}.bodegaId) gobierna qué almacén del MRP se usa; el vínculo
// bodega→almacén (columna pallet_warehouses.bodega_id) se configura en
// /dev/config-modulos/mrp-tarimas.
//
// Store compartido en memoria (al estilo de selectedWarehouse) para que todas
// las pantallas del módulo reutilicen una única resolución por bodega y no
// dispare una consulta a Supabase por pantalla.
import { getWarehouseByBodega } from "../../services/mrp";

let state = {
  bodegaId: null,
  warehouse: null, // { id, name, code, ... } | null
  loading: false,
  settled: false, // ya hubo respuesta (con o sin almacén) para bodegaId
  error: null,
};

const listeners = new Set();
let reqId = 0;

function emit() {
  listeners.forEach((fn) => fn());
}

export function getWorkspaceWarehouse() {
  return state;
}

export function subscribeWorkspaceWarehouse(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Resuelve (una sola vez por bodega) el almacén ligado. Idempotente: si ya está
 * resuelto o resolviendo para la misma bodega, no repite la consulta.
 * @param {string|null|undefined} bodegaId
 */
export function resolveWarehouseForBodega(bodegaId) {
  const clean = bodegaId ? String(bodegaId).trim() : null;

  if (clean === state.bodegaId && (state.loading || state.settled)) return;

  if (!clean) {
    reqId++;
    state = { bodegaId: null, warehouse: null, loading: false, settled: true, error: null };
    emit();
    return;
  }

  const my = ++reqId;
  state = { bodegaId: clean, warehouse: null, loading: true, settled: false, error: null };
  emit();

  getWarehouseByBodega(clean)
    .then((wh) => {
      if (my !== reqId) return; // respuesta obsoleta (cambió la bodega)
      state = {
        bodegaId: clean,
        warehouse: wh || null,
        loading: false,
        settled: true,
        error: null,
      };
      emit();
    })
    .catch((e) => {
      if (my !== reqId) return;
      state = {
        bodegaId: clean,
        warehouse: null,
        loading: false,
        settled: true,
        error: e?.message || "No se pudo resolver el almacén de la bodega.",
      };
      emit();
    });
}
