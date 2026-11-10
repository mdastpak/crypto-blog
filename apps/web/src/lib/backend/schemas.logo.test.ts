import { assetSchema } from "./schemas";

describe("logo_url", () => {
  const asset = { slug: "bitcoin", symbol: "BTC", name: "Bitcoin", verified: true };

  it("keeps https URLs and drops anything else", () => {
    expect(assetSchema.parse({ ...asset, logo_url: "https://a.example/btc.png" }).logo_url).toBe(
      "https://a.example/btc.png",
    );
    for (const bad of ["http://a.example/btc.png", "javascript:alert(1)", "btc.png", ""]) {
      expect(assetSchema.parse({ ...asset, logo_url: bad }).logo_url).toBeUndefined();
    }
  });
});
