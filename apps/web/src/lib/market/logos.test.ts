import { allowedLogoUrl, coinLogoPath, DEFAULT_COIN_LOGO_HOSTS } from "./logos";

describe("coin logos", () => {
  const hosts = ["logos.example"];

  it("allows https URLs on allowed hosts only", () => {
    expect(allowedLogoUrl("https://logos.example/btc.png", hosts)?.href).toBe(
      "https://logos.example/btc.png",
    );
    expect(allowedLogoUrl("https://LOGOS.example/btc.png", hosts)).toBeDefined();
    for (const bad of [
      "http://logos.example/btc.png",
      "https://logos.example.evil/btc.png",
      "https://evil.example/btc.png",
      "https://logos.example:444/btc.png",
      "https://a:b@logos.example/btc.png",
      `https://logos.example/${"a".repeat(2048)}`,
      "javascript:alert(1)",
      "",
      undefined,
    ]) {
      expect(allowedLogoUrl(bad, hosts)).toBeUndefined();
    }
  });

  it("links to this app's route", () => {
    expect(coinLogoPath("https://logos.example/btc.png?size=small", hosts)).toBe(
      "/coin-logo?u=https%3A%2F%2Flogos.example%2Fbtc.png%3Fsize%3Dsmall",
    );
    expect(coinLogoPath("https://evil.example/btc.png", hosts)).toBeUndefined();
  });

  it("allows the market-data sources' hosts by default", () => {
    expect(
      allowedLogoUrl(
        "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
        DEFAULT_COIN_LOGO_HOSTS,
      ),
    ).toBeDefined();
  });
});
