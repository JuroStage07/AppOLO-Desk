import { createContext, useContext } from "react";

// Persisted key + shared helpers for the app light/dark theme.
// Kept component-free so importing it doesn't break React Fast Refresh.

export const THEME_STORAGE_KEY = "appolo_theme";

/** Read the persisted theme, defaulting to "light". Safe if storage is blocked. */
export function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Reflect the theme on <html> (data-theme="dark" enables the dark tokens). */
export function applyThemeToDom(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

export const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
