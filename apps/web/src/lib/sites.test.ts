import { isCrawler, safeRedirectUrl } from "./sites";

describe("isCrawler", () => {
  it.each([
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true],
    ["Mozilla/5.0 (compatible; bingbot/2.0)", true],
    ["facebookexternalhit/1.1", true],
    ["TelegramBot (like TwitterBot)", true],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130", false],
    [null, false],
  ])("%s → %s", (ua, expected) => {
    expect(isCrawler(ua)).toBe(expected);
  });
});

describe("safeRedirectUrl", () => {
  const sites = [{ id: "ir", domain: "example.ir" }];

  it("accepts a URL on a listed site", () => {
    expect(
      safeRedirectUrl({ redirect: { needed: true, url: "https://example.ir/fa" }, sites }),
    ).toBe("https://example.ir/fa");
    expect(
      safeRedirectUrl({ redirect: { needed: true, url: "https://EXAMPLE.ir/x" }, site: sites[0] }),
    ).toBe("https://example.ir/x");
  });

  it.each([
    ["not needed", { redirect: { needed: false, url: "https://example.ir/" }, sites }],
    ["another domain", { redirect: { needed: true, url: "https://evil.example/" }, sites }],
    [
      "a subdomain trick",
      { redirect: { needed: true, url: "https://example.ir.evil.example/" }, sites },
    ],
    ["credentials", { redirect: { needed: true, url: "https://a:b@example.ir/" }, sites }],
    ["another scheme", { redirect: { needed: true, url: "javascript:alert(1)" }, sites }],
    ["a relative URL", { redirect: { needed: true, url: "//evil.example/" }, sites }],
    ["no sites", { redirect: { needed: true, url: "https://example.ir/" } }],
  ])("refuses %s", (_name, info) => {
    expect(safeRedirectUrl(info)).toBeUndefined();
  });
});
