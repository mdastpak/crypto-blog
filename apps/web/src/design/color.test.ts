import { contrastRatio, parseHex, relativeLuminance } from "./color";

describe("color", () => {
  it("parses #rrggbb", () => {
    expect(parseHex("#1d4ED8")).toEqual([29, 78, 216]);
    expect(() => parseHex("#fff")).toThrow();
  });

  it("computes luminance and contrast like WCAG", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
