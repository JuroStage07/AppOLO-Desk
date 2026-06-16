/**
 * Tiny pub-sub to trigger the Pins flyout from anywhere (e.g. keyboard shortcut).
 * Same pattern as commandPaletteBus.js.
 */
const listeners = new Set();

export function openPinsFlyout() {
  listeners.forEach((fn) => fn());
}

export function onOpenPins(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
