// Design tokens for the AppoloDesk corporate theme.
// Source of truth: src/pages/Recepcion/* (mirrors that look & feel).

export const ACCENT = "#089F8A";
export const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
export const ACCENT_BORDER = "rgba(8, 159, 138, 0.35)";
export const ACCENT_SHADOW = "rgba(8, 159, 138, 0.28)";

// Build an `rgba()` string from a hex color + alpha. Lets pages derive brand
// tints at any opacity from the single ACCENT source instead of hardcoding a
// new `rgba(8,159,138,…)` literal. Output is identical to the literal it
// replaces, so swapping a hardcoded tint for `accentAlpha(x)` is visual-neutral.
export function withAlpha(hex, alpha) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export const accentAlpha = (alpha) => withAlpha(ACCENT, alpha);

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
  "Arial, sans-serif";

// ─── Typographic scale ───────────────────────────────────────────────
// Use these instead of hardcoding fontSize in page styles. Sizes are px.
export const FS_XS = 11; // microcopy, captions, table footnotes
export const FS_SM = 12; // secondary labels, chips, hints
export const FS_BASE = 14; // default body text
export const FS_MD = 16; // emphasized body / inputs
export const FS_LG = 18; // card titles, section subtitles
export const FS_XL = 22; // page section titles
export const FS_2XL = 28; // page titles
export const FS_3XL = 34; // hero / landing headlines

// Font weights (named for intent, not value).
export const FW_REGULAR = 400;
export const FW_MEDIUM = 500;
export const FW_SEMIBOLD = 600;
export const FW_BOLD = 700;
export const FW_EXTRABOLD = 800;

// Line heights (unitless multipliers).
export const LH_TIGHT = 1.15; // large headings
export const LH_SNUG = 1.3; // titles / subtitles
export const LH_NORMAL = 1.5; // body copy
export const LH_RELAXED = 1.6; // long-form text

// ─── Spacing scale (4px base grid) ───────────────────────────────────
// Use for padding/margin/gap to keep a consistent vertical & horizontal rhythm.
export const SPACE_1 = 4;
export const SPACE_2 = 8;
export const SPACE_3 = 12;
export const SPACE_4 = 16;
export const SPACE_5 = 20;
export const SPACE_6 = 24;
export const SPACE_8 = 32;
export const SPACE_10 = 40;
export const SPACE_12 = 48;
export const SPACE_16 = 64;

// Aggregate export for ergonomic imports: `import { theme } from "../../styles/theme"`
export const theme = {
  ACCENT,
  ACCENT_SOFT,
  ACCENT_BORDER,
  ACCENT_SHADOW,
  withAlpha,
  accentAlpha,
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
  FS_XS,
  FS_SM,
  FS_BASE,
  FS_MD,
  FS_LG,
  FS_XL,
  FS_2XL,
  FS_3XL,
  FW_REGULAR,
  FW_MEDIUM,
  FW_SEMIBOLD,
  FW_BOLD,
  FW_EXTRABOLD,
  LH_TIGHT,
  LH_SNUG,
  LH_NORMAL,
  LH_RELAXED,
  SPACE_1,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  SPACE_8,
  SPACE_10,
  SPACE_12,
  SPACE_16,
};

export default theme;
