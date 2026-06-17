/**
 * Tiny event bus to open the global <CommandPalette/> from anywhere (e.g. the
 * Topbar search button) without prop drilling. Kept in a plain module so
 * importing it doesn't break React Fast Refresh.
 */
export const OPEN_COMMAND_PALETTE_EVENT = "appolo:open-command-palette";
export const CLOSE_COMMAND_PALETTE_EVENT = "appolo:close-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

export function onCommandPaletteClose(callback) {
  window.addEventListener(CLOSE_COMMAND_PALETTE_EVENT, callback);
  return () => window.removeEventListener(CLOSE_COMMAND_PALETTE_EVENT, callback);
}
