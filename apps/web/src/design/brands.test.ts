import { existsSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_LOCALES } from "@/i18n/locales";
import { brandCss, BRANDS, getBrand, isBrand, resolvePalette } from "./brands";
import { contrastRatio, parseHex } from "./color";
import { COLOR_TOKENS, CONTRAST_PAIRS } from "./tokens";

const brands = Object.values(BRANDS);
const themes = ["light", "dark"] as const;

describe.each(brands)("brand $id", (brand) => {
  it.each(themes)("%s palette defines every token as #rrggbb", (theme) => {
    const palette = resolvePalette(brand, theme);
    for (const token of COLOR_TOKENS) expect(() => parseHex(palette[token]), token).not.toThrow();
  });

  it.each(themes)("%s palette meets WCAG AA contrast", (theme) => {
    const palette = resolvePalette(brand, theme);
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("has a name in every locale", () => {
    for (const locale of AVAILABLE_LOCALES) expect(brand.name[locale]).toBeTruthy();
  });

  it("ships its logos and favicon", () => {
    for (const path of [brand.logo.light, brand.logo.dark, brand.favicon]) {
      expect(existsSync(join(process.cwd(), "public", path)), path).toBe(true);
    }
  });

  it("is keyed by its id", () => {
    expect(BRANDS[brand.id]).toBe(brand);
  });
});

describe("palettes", () => {
  it("red-up brands swap the market colors", () => {
    const base = getBrand("default");
    const redUp = { ...base, marketColors: "red-up" as const };
    expect(resolvePalette(redUp, "light").up).toBe(resolvePalette(base, "light").down);
    expect(resolvePalette(redUp, "light").down).toBe(resolvePalette(base, "light").up);
  });

  it("brand overrides win over the base", () => {
    expect(resolvePalette(getBrand("emerald"), "light").primary).toBe("#047857");
    expect(resolvePalette(getBrand("emerald"), "light").text).toBe(
      resolvePalette(getBrand("default"), "light").text,
    );
  });
});

describe("brandCss", () => {
  const css = brandCss(getBrand("default"));

  it("writes light, explicit dark, and system dark", () => {
    expect(css).toContain(":root{color-scheme:light;--background:#ffffff;");
    expect(css).toContain(':root[data-theme="dark"]{color-scheme:dark;--background:#0b1220;');
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
  });

  it("has no characters that could close the style element", () => {
    for (const brand of brands) expect(brandCss(brand)).not.toMatch(/[<>]/);
  });
});

it("knows its brands", () => {
  expect(isBrand("default")).toBe(true);
  expect(isBrand("nope")).toBe(false);
  expect(isBrand("toString")).toBe(false);
  expect(() => getBrand("nope")).toThrow("unknown brand: nope");
});
