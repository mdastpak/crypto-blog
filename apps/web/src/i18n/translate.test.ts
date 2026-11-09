import { CATALOGS, createTranslator, format } from "./translate";

describe("catalogs", () => {
  const reference = Object.keys(CATALOGS.en).sort();

  it.each(Object.keys(CATALOGS))("%s has exactly the keys of en", (locale) => {
    expect(Object.keys(CATALOGS[locale as keyof typeof CATALOGS]).sort()).toEqual(reference);
  });

  it.each(Object.keys(CATALOGS))("%s has no empty message", (locale) => {
    for (const [key, value] of Object.entries(CATALOGS[locale as keyof typeof CATALOGS])) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it.each(Object.keys(CATALOGS))("%s uses the same placeholders as en", (locale) => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const catalog = CATALOGS[locale as keyof typeof CATALOGS];
    for (const [key, value] of Object.entries(CATALOGS.en)) {
      expect(names(catalog[key as keyof typeof catalog]), key).toEqual(names(value));
    }
  });

  it("keys are SCREAMING_SNAKE", () => {
    for (const key of Object.keys(CATALOGS.en)) expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

describe("format", () => {
  it("fills named parameters in any position", () => {
    expect(format("{a} and {b}", { b: 2, a: "one" }, false)).toBe("one and 2");
  });

  it("isolates values in RTL", () => {
    expect(format("قیمت {pair}", { pair: "BTC/USDT" }, true)).toBe("قیمت ⁨BTC/USDT⁩");
  });

  it("leaves a missing parameter visible", () => {
    expect(format("Updated {date}", {}, false)).toBe("Updated {date}");
  });
});

describe("createTranslator", () => {
  it("translates per locale", () => {
    expect(createTranslator("en")("SITE_NAME")).toBe("Crypto Blog");
    expect(createTranslator("fa")("SITE_NAME")).toBe("کریپتو بلاگ");
    expect(createTranslator("fa")("HOME_UPDATED_AT", { date: "x" })).toBe("به‌روزرسانی: ⁨x⁩");
  });
});
