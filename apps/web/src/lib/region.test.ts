import { regionFeatures, showsQuote, venueRegions } from "./region";

describe("region", () => {
  it("an Iranian release shows everything", () => {
    expect(regionFeatures("ir")).toEqual({
      iranianVenues: true,
      irtPrices: true,
      iranianPayments: true,
    });
    expect(venueRegions("ir")).toEqual(["global", "ir"]);
    expect(showsQuote("ir", "ir", "IRT")).toBe(true);
  });

  it("an international release hides Iranian venues and toman prices", () => {
    expect(venueRegions("international")).toEqual(["global"]);
    expect(showsQuote("international", "ir", "USDT")).toBe(false);
    expect(showsQuote("international", "global", "irt")).toBe(false);
    expect(showsQuote("international", "global", "USDT")).toBe(true);
  });
});
