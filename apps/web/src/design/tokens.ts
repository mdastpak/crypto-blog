/**
 * Semantic color tokens. Components use only these (through Tailwind:
 * `bg-surface`, `text-muted`, `text-up`), never raw colors, so that a brand
 * or a theme changes every page at once.
 */
export const COLOR_TOKENS = [
  "background",
  "surface",
  "surface-muted",
  "border",
  "text",
  "text-muted",
  "primary",
  "primary-contrast",
  "accent",
  "success",
  "danger",
  "warning",
  "info",
  "up",
  "down",
  "focus",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Record<ColorToken, string>;

/**
 * Pairs that must stay readable: [foreground, background, minimum ratio].
 * 4.5 is WCAG AA for body text, 3 for large text and UI parts.
 */
export const CONTRAST_PAIRS: [ColorToken, ColorToken, number][] = [
  ["text", "background", 4.5],
  ["text", "surface", 4.5],
  ["text", "surface-muted", 4.5],
  ["text-muted", "background", 4.5],
  ["text-muted", "surface", 4.5],
  ["primary-contrast", "primary", 4.5],
  ["primary", "background", 3],
  ["accent", "background", 3],
  ["success", "background", 3],
  ["danger", "background", 3],
  ["warning", "background", 3],
  ["info", "background", 3],
  ["up", "background", 4.5],
  ["down", "background", 4.5],
  ["up", "surface", 4.5],
  ["down", "surface", 4.5],
  ["focus", "background", 3],
];

/** The neutral and semantic palettes every brand starts from. */
export const BASE_PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    background: "#ffffff",
    surface: "#f8fafc",
    "surface-muted": "#f1f5f9",
    border: "#e2e8f0",
    text: "#0f172a",
    "text-muted": "#475569",
    primary: "#1d4ed8",
    "primary-contrast": "#ffffff",
    accent: "#7c3aed",
    success: "#15803d",
    danger: "#b91c1c",
    warning: "#b45309",
    info: "#0369a1",
    up: "#15803d",
    down: "#b91c1c",
    focus: "#2563eb",
  },
  dark: {
    background: "#0b1220",
    surface: "#111a2e",
    "surface-muted": "#1a2540",
    border: "#26324d",
    text: "#e2e8f0",
    "text-muted": "#94a3b8",
    primary: "#60a5fa",
    "primary-contrast": "#0b1220",
    accent: "#a78bfa",
    success: "#4ade80",
    danger: "#f87171",
    warning: "#fbbf24",
    info: "#38bdf8",
    up: "#4ade80",
    down: "#f87171",
    focus: "#93c5fd",
  },
};
