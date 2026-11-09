import { describe, expect, it } from "vitest";
import { hreflangLinks } from "./alternates";

const base = {
  path: "coins/bitcoin",
  ownUrl: "https://blog.example.com",
  defaultLocale: "fa" as const,
};

describe("hreflang links", () => {
  it("without country sites: each locale here, x-default in the default locale", () => {
    expect(hreflangLinks({ ...base, locales: ["fa", "en"], sites: [] }).languages).toEqual({
      fa: "https://blog.example.com/fa/coins/bitcoin",
      en: "https://blog.example.com/en/coins/bitcoin",
      "x-default": "https://blog.example.com/fa/coins/bitcoin",
    });
  });

  it("names each country of a country site, and sends x-default to the global site", () => {
    const sites = [
      {
        id: "ir",
        domain: "example.ir",
        url: "https://example.ir",
        locales: ["fa", "en"],
        countries: ["ir"],
      },
      { id: "global", domain: "blog.example.com", locales: ["en"], default_locale: "en" },
    ];
    expect(hreflangLinks({ ...base, locales: ["fa", "en"], sites }).languages).toEqual({
      "fa-IR": "https://example.ir/fa/coins/bitcoin",
      "en-IR": "https://example.ir/en/coins/bitcoin",
      en: "https://blog.example.com/en/coins/bitcoin",
      "x-default": "https://blog.example.com/en/coins/bitcoin",
    });
  });

  it("links only the locales a document is translated into", () => {
    const sites = [{ id: "global", domain: "blog.example.com", locales: ["fa", "en"] }];
    expect(hreflangLinks({ ...base, path: "blog/x", locales: ["fa"], sites }).languages).toEqual({
      fa: "https://blog.example.com/fa/blog/x",
      "x-default": "https://blog.example.com/fa/blog/x",
    });
  });

  it("keeps this site when the backend does not list it, and handles the home page", () => {
    const sites = [{ id: "ir", domain: "example.ir", countries: ["IR"], locales: ["fa"] }];
    expect(hreflangLinks({ ...base, path: "", locales: ["fa", "en"], sites }).languages).toEqual({
      fa: "https://blog.example.com/fa",
      en: "https://blog.example.com/en",
      "fa-IR": "https://example.ir/fa",
      "x-default": "https://blog.example.com/fa",
    });
  });
});
