import { matchLocale, negotiateLocale, parseAcceptLanguage } from "./negotiate";

describe("parseAcceptLanguage", () => {
  it("orders by quality, then by position", () => {
    expect(parseAcceptLanguage("en;q=0.5, fa-IR, de;q=0.5, *;q=0.1")).toEqual([
      "fa-IR",
      "en",
      "de",
    ]);
  });

  it("skips invalid and zero qualities", () => {
    expect(parseAcceptLanguage("en;q=0, fa;q=abc, de;q=2, tr")).toEqual(["tr"]);
  });

  it("accepts an empty header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });
});

describe("matchLocale", () => {
  it("finds the locale of the language when the region is not listed", () => {
    expect(matchLocale("fa-AF", ["fa", "en"])).toBe("fa");
    expect(matchLocale("EN_us", ["fa", "en"])).toBe("en");
    expect(matchLocale("de", ["fa", "en"])).toBeUndefined();
  });

  it("only matches enabled locales", () => {
    expect(matchLocale("en", ["fa"])).toBeUndefined();
  });
});

describe("negotiateLocale", () => {
  const enabled = ["fa", "en"] as const;

  it("prefers the cookie", () => {
    expect(negotiateLocale({ cookie: "en", acceptLanguage: "fa" }, enabled, "fa")).toBe("en");
  });

  it("skips a stale cookie", () => {
    expect(negotiateLocale({ cookie: "de", acceptLanguage: "en" }, enabled, "fa")).toBe("en");
  });

  it("uses the browser's languages, best first", () => {
    expect(negotiateLocale({ acceptLanguage: "de, en;q=0.8, fa;q=0.9" }, enabled, "en")).toBe("fa");
  });

  it("falls back to the default", () => {
    expect(negotiateLocale({ acceptLanguage: "de" }, enabled, "fa")).toBe("fa");
    expect(negotiateLocale({}, enabled, "en")).toBe("en");
  });
});
