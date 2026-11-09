import type { Locale } from "@/i18n/locales";
import { BASE_PALETTES, COLOR_TOKENS, type ColorToken, type Palette } from "./tokens";

/**
 * Which color means "the price went up". Most markets use green; some
 * (China, Japan, Korea) use red, so a brand for them can swap.
 */
export type MarketColors = "green-up" | "red-up";

export interface Brand {
  id: string;
  /** The name shown in the header and in titles, per locale. */
  name: Record<Locale, string>;
  /** Paths under /public. */
  logo: { light: string; dark: string };
  favicon: string;
  /** Overrides of the base palettes; only what differs. */
  palette: { light: Partial<Palette>; dark: Partial<Palette> };
  marketColors: MarketColors;
}

/**
 * The brands of this build. A brand is data only: adding one needs no
 * component change. The release picks one with BRAND; country sites (#3)
 * may pick their own.
 */
export const BRANDS: Record<string, Brand> = {
  default: {
    id: "default",
    name: { fa: "کریپتو بلاگ", en: "Crypto Blog" },
    logo: { light: "/brands/default/logo.svg", dark: "/brands/default/logo-dark.svg" },
    favicon: "/brands/default/favicon.svg",
    palette: { light: {}, dark: {} },
    marketColors: "green-up",
  },
  emerald: {
    id: "emerald",
    name: { fa: "کریپتو بلاگ", en: "Crypto Blog" },
    logo: { light: "/brands/emerald/logo.svg", dark: "/brands/emerald/logo-dark.svg" },
    favicon: "/brands/emerald/favicon.svg",
    palette: {
      light: { primary: "#047857", accent: "#0e7490", focus: "#047857" },
      dark: {
        primary: "#34d399",
        "primary-contrast": "#052e22",
        accent: "#22d3ee",
        focus: "#6ee7b7",
      },
    },
    marketColors: "green-up",
  },
};

export const DEFAULT_BRAND = "default";

export function isBrand(id: string | undefined): boolean {
  return id !== undefined && Object.hasOwn(BRANDS, id);
}

export function getBrand(id: string): Brand {
  const brand = BRANDS[id];
  if (!brand) throw new Error(`unknown brand: ${id}`);
  return brand;
}

/** The full palette of a brand in a theme, market colors applied. */
export function resolvePalette(brand: Brand, theme: "light" | "dark"): Palette {
  const palette: Palette = { ...BASE_PALETTES[theme], ...brand.palette[theme] };
  if (brand.marketColors === "red-up") {
    [palette.up, palette.down] = [palette.down, palette.up];
  }
  return palette;
}

function declarations(palette: Palette): string {
  return COLOR_TOKENS.map((token: ColorToken) => `--${token}:${palette[token]};`).join("");
}

/**
 * The CSS custom properties of a brand: light by default, dark for
 * `data-theme="dark"` and for the system setting when no theme is chosen.
 */
export function brandCss(brand: Brand): string {
  const light = declarations(resolvePalette(brand, "light"));
  const dark = declarations(resolvePalette(brand, "dark"));
  return [
    `:root{color-scheme:light;${light}}`,
    `:root[data-theme="dark"]{color-scheme:dark;${dark}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;${dark}}}`,
  ].join("");
}
