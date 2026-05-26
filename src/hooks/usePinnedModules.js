import { useCallback, useMemo, useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// Pinned quick-access cards, persisted per user in Firestore so they follow the
// account across devices and never bleed between users.
//   profiles/{uid}/prefs/pinned => { modules: { [moduleKey]: { label, path }[] }, updatedAt }
//
// A single module-level subscription feeds every hook instance (page cards +
// QuickCard + sidebar) through useSyncExternalStore, so all stay in sync.
const EMPTY = [];
const listeners = new Set();

let modulesStore = {}; // { [moduleKey]: { label, path }[] }
let currentUid = null;
let unsubDoc = null;
let started = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function setData(next) {
  modulesStore = next && typeof next === "object" && !Array.isArray(next) ? next : {};
  emit();
}

function prefDocRef(uid) {
  return doc(db, "profiles", uid, "prefs", "pinned");
}

function attachDoc(uid) {
  if (unsubDoc) {
    unsubDoc();
    unsubDoc = null;
  }
  if (!uid) {
    setData({});
    return;
  }
  unsubDoc = onSnapshot(
    prefDocRef(uid),
    (snap) => setData(snap.exists() ? snap.data().modules : {}),
    () => setData({})
  );
}

function ensureStarted() {
  if (started) return;
  started = true;
  onAuthStateChanged(auth, (user) => {
    const uid = user?.uid ?? null;
    if (uid !== currentUid) {
      currentUid = uid;
      attachDoc(uid);
    }
  });
}

function subscribe(listener) {
  ensureStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return modulesStore;
}

function persist(nextModules) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  setData(nextModules); // optimistic; onSnapshot reconciles with server truth
  setDoc(
    prefDocRef(uid),
    { modules: nextModules, updatedAt: serverTimestamp() },
    { merge: true }
  ).catch(() => {
    // ignore; the snapshot listener keeps the UI consistent with Firestore
  });
}

function togglePinIn(moduleKey, label, path) {
  const list = modulesStore[moduleKey] ?? [];
  const exists = list.some((p) => p.path === path);
  const nextList = exists
    ? list.filter((p) => p.path !== path)
    : [...list, { label, path }];
  persist({ ...modulesStore, [moduleKey]: nextList });
}

function removePinIn(moduleKey, path) {
  const list = modulesStore[moduleKey] ?? [];
  persist({ ...modulesStore, [moduleKey]: list.filter((p) => p.path !== path) });
}

/**
 * Pinned quick-access cards, scoped per module.
 * Each pin is { label, path }.
 *
 * @param {string} moduleKey - module scope, e.g. "salud", "despacho",
 *   "mantenimiento", "servicios-generales", "recepcion", "epa".
 */
export default function usePinnedModules(moduleKey = "global") {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const pinned = snapshot[moduleKey] ?? EMPTY;

  const isPinned = useCallback(
    (path) => (modulesStore[moduleKey] ?? EMPTY).some((p) => p.path === path),
    [moduleKey]
  );

  const togglePin = useCallback(
    (label, path) => togglePinIn(moduleKey, label, path),
    [moduleKey]
  );

  const removePin = useCallback(
    (path) => removePinIn(moduleKey, path),
    [moduleKey]
  );

  return { pinned, isPinned, togglePin, removePin };
}

/**
 * Read every pin across all modules, flattened into a single list.
 * Each entry is { moduleKey, label, path }. Used by the global "Mis Pin"
 * sidebar flyout.
 */
export function useAllPinnedModules() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const pins = useMemo(() => {
    const out = [];
    for (const [moduleKey, list] of Object.entries(snapshot)) {
      if (Array.isArray(list)) {
        list.forEach((p) => out.push({ ...p, moduleKey }));
      }
    }
    return out;
  }, [snapshot]);

  const removePin = useCallback((moduleKey, path) => removePinIn(moduleKey, path), []);

  return { pins, removePin };
}
