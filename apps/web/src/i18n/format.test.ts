import { formatDate, formatNumber, formatPercentChange, formatPrice } from "./format";

const date = new Date(Date.UTC(2026, 10, 9, 12));

describe("formatting", () => {
  it("uses Persian digits for fa", () => {
    expect(formatNumber("fa", 1234.5)).toBe("۱٬۲۳۴٫۵");
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
  });

  it("signs percent changes", () => {
    expect(formatPercentChange("en", 0.0123)).toBe("+1.23%");
    expect(formatPercentChange("en", -0.05)).toBe("-5.00%");
    expect(formatPercentChange("en", 0)).toBe("0.00%");
  });

  it("formats ISO currencies with their symbol and other quotes with their code", () => {
    expect(formatPrice("en", 64250.5, "USD")).toBe("$64,250.50");
    expect(formatPrice("en", 1.5, "USDT")).toBe("1.5 USDT");
    expect(formatPrice("en", 0.000012345, "BTC")).toBe("0.00001235 BTC");
  });

  it("shows fa dates in the Persian calendar by default", () => {
    expect(formatDate("fa", date, { dateStyle: "long", timeZone: "UTC" })).toBe("۱۸ آبان ۱۴۰۵");
    expect(
      formatDate("fa", date, { dateStyle: "long", timeZone: "UTC", calendar: "gregory" }),
    ).toBe("۹ نوامبر ۲۰۲۶");
    expect(formatDate("en", date, { dateStyle: "long", timeZone: "UTC" })).toBe("November 9, 2026");
  });
});
