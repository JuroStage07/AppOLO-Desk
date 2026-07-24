import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThemeContext,
  THEME_STORAGE_KEY,
  readStoredTheme,
  applyThemeToDom,
} from "./themeCore";

/**
 * App-wide light/dark theme provider. Persists the choice in localStorage and
 * reflects it on <html data-theme>, which flips the CSS variables backing the
 * neutral tokens in src/styles/theme.js. The brand accent (green) is unchanged.
 */
export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyThemeToDom(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === "dark" ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({ theme, isDark: theme === "dark", toggle, setTheme }),
    [theme, toggle, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
