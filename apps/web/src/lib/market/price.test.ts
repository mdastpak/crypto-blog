import type { VenueQuote } from "@/lib/backend/schemas";
import { median, referencePrice, spreadFromMedian, toNumber, visibleQuotes } from "./price";

function q(partial: Partial<VenueQuote>): VenueQuote {
  return {
    venue: "binance",
    pair: "BTCUSDT",
    quote: "USDT",
    last: "100",
    observed_at: "2026-11-09T10:00:00Z",
    stale: false,
    outlier: false,
    region: "global",
    ...partial,
  };
}

describe("median", () => {
  it("handles odd, even, and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe("toNumber", () => {
  it("reads decimal strings", () => {
    expect(toNumber("64250.5")).toBe(64250.5);
    expect(toNumber(undefined)).toBeUndefined();
    expect(toNumber("x")).toBeUndefined();
  });
});

describe("referencePrice", () => {
  it("takes the median of usable venues in the first reference quote", () => {
    const price = referencePrice(
      [
        q({
          venue: "a",
          last: "100",
          open: "90",
          volume_quote: "10",
          observed_at: "2026-11-09T10:00:00Z",
        }),
        q({
          venue: "b",
          last: "102",
          open: "100",
          volume_quote: "50",
          observed_at: "2026-11-09T10:02:00Z",
        }),
        q({ venue: "c", last: "500", outlier: true }),
        q({ venue: "d", last: "1", stale: true }),
        q({ venue: "e", quote: "USD", last: "999" }),
      ],
      "ir",
    );
    expect(price).toEqual({
      quote: "USDT",
      price: 101,
      change: expect.closeTo((100 / 90 - 1 + 0.02) / 2, 10),
      venues: 2,
      observedAt: "2026-11-09T10:02:00Z",
      chartVenue: "b",
    });
  });

  it("falls back to the next quote", () => {
    expect(referencePrice([q({ quote: "USD", last: "5" })], "ir")?.quote).toBe("USD");
  });

  it("is undefined without a usable price", () => {
    expect(referencePrice([q({ stale: true })], "ir")).toBeUndefined();
    expect(referencePrice([q({ quote: "IRT" })], "ir")).toBeUndefined();
  });

  it("ignores Iranian venues in an international release", () => {
    expect(referencePrice([q({ region: "ir" })], "international")).toBeUndefined();
    expect(referencePrice([q({ region: "ir" })], "ir")?.price).toBe(100);
  });
});

describe("visibleQuotes", () => {
  it("hides toman prices abroad", () => {
    const quotes = [q({ quote: "IRT", region: "ir" }), q({})];
    expect(visibleQuotes(quotes, "international")).toHaveLength(1);
    expect(visibleQuotes(quotes, "ir")).toHaveLength(2);
  });
});

describe("spreadFromMedian", () => {
  it("is the ratio to the median", () => {
    expect(spreadFromMedian(q({ last: "101", median: "100" }))).toBeCloseTo(0.01);
    expect(spreadFromMedian(q({ median: undefined }))).toBeUndefined();
  });
});
