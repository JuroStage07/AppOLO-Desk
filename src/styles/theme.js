// Design tokens for the AppoloDesk corporate theme.
// Source of truth: src/pages/Recepcion/* (mirrors that look & feel).

export const ACCENT = "#089F8A";
export const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
export const ACCENT_BORDER = "rgba(8, 159, 138, 0.35)";
export const ACCENT_SHADOW = "rgba(8, 159, 138, 0.28)";

export const SLATE = "#64748B";
export const SLATE_DEEP = "#475569";
export const TEXT = "#0F172A";
export const MUTED = "#94A3B8";

export const SURFACE = "#FFFFFF";
export const SURFACE_SOFT = "#FBFCFF";
export const SURFACE_INSET = "#F2F4FB";
export const BG = "#F6F7FB";

export const BORDER = "#E7E9F2";
export const BORDER_SOFT = "#EEF0F7";

// Status palette (used by StatusPill, Field validation, etc.)
export const OK_BG = "#EAF7EE";
export const OK_BORDER = "#C6EAD2";
export const WARN_BG = "#FFF4DF";
export const WARN_BORDER = "#FFE1A8";
export const DANGER_BG = "#FEECEC";
export const DANGER_BORDER = "#F6C7C7";
export const DANGER = "#B91C1C";

// Effects
export const SHADOW_CARD = "0 12px 26px rgba(15, 23, 42, 0.06)";
export const SHADOW_CARD_HOVER = "0 16px 36px rgba(15, 23, 42, 0.12)";
export const SHADOW_SOFT = "0 10px 24px rgba(15, 23, 42, 0.05)";
export const SHADOW_BTN = "0 4px 14px rgba(15, 23, 42, 0.06)";
export const SHADOW_ACCENT = `0 12px 28px ${ACCENT_SHADOW}`;
export const SHADOW_HERO = "0 16px 40px rgba(15, 23, 42, 0.08)";

// Geometry
export const RADIUS_SM = 10;
export const RADIUS_MD = 12;
export const RADIUS = 14;
export const RADIUS_LG = 16;
export const RADIUS_XL = 18;
export const RADIUS_2XL = 22;
export const RADIUS_PILL = 999;

export const CONTAINER_MAX = 1120;

export const FONT_STACK =
  "system-ui, -apple-system, Segoe UI, Roboto, Arial";

// Aggregate export for ergonomic imports: `import { theme } from "../../styles/theme"`
export const theme = {
  ACCENT,
  ACCENT_SOFT,
  ACCENT_BORDER,
  ACCENT_SHADOW,
  SLATE,
  SLATE_DEEP,
  TEXT,
  MUTED,
  SURFACE,
  SURFACE_SOFT,
  SURFACE_INSET,
  BG,
  BORDER,
  BORDER_SOFT,
  OK_BG,
  OK_BORDER,
  WARN_BG,
  WARN_BORDER,
  DANGER_BG,
  DANGER_BORDER,
  DANGER,
  SHADOW_CARD,
  SHADOW_CARD_HOVER,
  SHADOW_SOFT,
  SHADOW_BTN,
  SHADOW_ACCENT,
  SHADOW_HERO,
  RADIUS_SM,
  RADIUS_MD,
  RADIUS,
  RADIUS_LG,
  RADIUS_XL,
  RADIUS_2XL,
  RADIUS_PILL,
  CONTAINER_MAX,
  FONT_STACK,
};

export default theme;
