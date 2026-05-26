import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "appolo_pinned_modules";
const EMPTY = [];

// Shared external store so every hook instance (page cards + QuickCard) stays
// in sync within the same tab, and across tabs via the `storage` event.
const listeners = new Set();
let store; // { [moduleKey]: { label, path }[] }

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Current shape is a map keyed by moduleKey. Ignore any legacy array.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function getStore() {
  if (store === undefined) store = loadFromStorage();
  return store;
}

function setStore(next) {
  store = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / unavailable storage
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) {
      store = loadFromStorage();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Pinned quick-access cards, scoped per module.
 * Each pin is { label, path }; persisted as { [moduleKey]: Pin[] } in localStorage.
 *
 * @param {string} moduleKey - module scope, e.g. "salud", "despacho",
 *   "mantenimiento", "servicios-generales", "recepcion", "epa".
 */
export default function usePinnedModules(moduleKey = "global") {
  const snapshot = useSyncExternalStore(subscribe, getStore, getStore);
  const pinned = snapshot[moduleKey] ?? EMPTY;

  const isPinned = useCallback(
    (path) => (getStore()[moduleKey] ?? EMPTY).some((p) => p.path === path),
    [moduleKey]
  );

  const togglePin = useCallback(
    (label, path) => {
      const current = getStore();
      const list = current[moduleKey] ?? [];
      const exists = list.some((p) => p.path === path);
      const nextList = exists
        ? list.filter((p) => p.path !== path)
        : [...list, { label, path }];
      setStore({ ...current, [moduleKey]: nextList });
    },
    [moduleKey]
  );

  const removePin = useCallback(
    (path) => {
      const current = getStore();
      const list = current[moduleKey] ?? [];
      setStore({ ...current, [moduleKey]: list.filter((p) => p.path !== path) });
    },
    [moduleKey]
  );

  return { pinned, isPinned, togglePin, removePin };
}

/**
 * Read every pin across all modules, flattened into a single list.
 * Each entry is { moduleKey, label, path }. Used by the global "Mis Pin"
 * sidebar section.
 */
export function useAllPinnedModules() {
  const snapshot = useSyncExternalStore(subscribe, getStore, getStore);

  const pins = useMemo(() => {
    const out = [];
    for (const [moduleKey, list] of Object.entries(snapshot)) {
      if (Array.isArray(list)) {
        list.forEach((p) => out.push({ ...p, moduleKey }));
      }
    }
    return out;
  }, [snapshot]);

  const removePin = useCallback((moduleKey, path) => {
    const current = getStore();
    const list = current[moduleKey] ?? [];
    setStore({ ...current, [moduleKey]: list.filter((p) => p.path !== path) });
  }, []);

  return { pins, removePin };
}
