import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../theme/themeCore";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE_DEEP, SURFACE } from "../../styles/theme";

/**
 * App-wide light/dark switch. Shows a Moon in light mode (tap to go dark) and a
 * Sun in dark mode (tap to go light). Two visual variants:
 *   - "icon" (default): compact round icon button, for topbars/headers.
 *   - "full": labeled row button, for menus/drawers (e.g. AreasSidebar footer).
 */
export default function ThemeToggle({ variant = "icon", style }) {
  const { isDark, toggle } = useTheme();
  const label = isDark ? "Modo claro" : "Modo oscuro";
  const Icon = isDark ? Sun : Moon;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={toggle}
        style={{ ...fullBtn, ...style }}
        title={label}
        aria-label={label}
        aria-pressed={isDark}
      >
        <Icon size={16} strokeWidth={2.2} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{ ...iconBtn, ...style }}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
    >
      <Icon size={17} strokeWidth={2.2} />
    </button>
  );
}

const iconBtn = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: SLATE_DEEP,
  transition: "all 150ms ease",
  fontFamily: "inherit",
  padding: 0,
  flexShrink: 0,
};

const fullBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "10px 8px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: ACCENT_SOFT,
  color: ACCENT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 150ms ease",
};
