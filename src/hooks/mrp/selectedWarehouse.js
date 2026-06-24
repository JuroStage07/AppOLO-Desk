// MRP Tarimas — almacén de trabajo seleccionado (store en memoria + localStorage).
//
// Una sola fuente compartida entre todas las pantallas del módulo, al estilo de
// usePinnedModules. Persiste { id, name, code } para sobrevivir recargas.
const KEY = "appolo_mrp_warehouse";
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let current = load();

export function getSelectedWarehouse() {
  return current;
}

export function setSelectedWarehouse(wh) {
  current = wh || null;
  try {
    if (wh) localStorage.setItem(KEY, JSON.stringify(wh));
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible; el estado en memoria igual funciona */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeWarehouse(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
