import { render, screen, within } from "@testing-library/react";
import type { VenueQuote } from "@/lib/backend/schemas";
import { CoinLogo } from "./CoinLogo";
import { chartPath, PriceChart } from "./PriceChart";
import { VenueTable } from "./VenueTable";

const quote = (venue: string, last: string, extra: Partial<VenueQuote> = {}): VenueQuote => ({
  venue,
  pair: "BTCUSDT",
  quote: "USDT",
  last,
  median: "100",
  observed_at: "2026-11-09T10:00:00Z",
  stale: false,
  outlier: false,
  ...extra,
});

describe("chartPath", () => {
  it("maps the closes into the box, high at the top", () => {
    expect(
      chartPath(
        [
          { time: "a", close: 1 },
          { time: "b", close: 2 },
        ],
        100,
        50,
      ),
    ).toBe("M8.0,42.0 L92.0,8.0");
    expect(chartPath([{ time: "a", close: 1 }], 100, 50)).toBe("");
  });
});

describe("PriceChart", () => {
  it("labels the range for screen readers and colors by trend", () => {
    render(
      <PriceChart
        locale="en"
        quote="USDT"
        label="Bitcoin daily close"
        points={[
          { time: "2026-11-01T00:00:00Z", close: 120 },
          { time: "2026-11-09T00:00:00Z", close: 100 },
        ]}
      />,
    );
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(
      /Bitcoin daily close\. Nov 1, 2026 – Nov 9, 2026: 100 USDT – 120 USDT/,
    );
    expect(chart).toHaveClass("text-down");
  });

  it("renders nothing with fewer than two points", () => {
    const { container } = render(<PriceChart locale="en" quote="USDT" label="x" points={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VenueTable", () => {
  it("sorts by volume and marks stale and outlier prices", () => {
    render(
      <VenueTable
        locale="en"
        caption="Prices"
        quotes={[
          quote("small", "101", { volume_quote: "10", stale: true }),
          quote("big", "99", { volume_quote: "1000", venue_name: "Big Exchange" }),
          quote("odd", "150", { outlier: true }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("table", { name: "Prices" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Big Exchange"),
      expect.stringContaining("Stale"),
      expect.stringContaining("Outlier"),
    ]);
    expect(rows[0]).toHaveTextContent("-1.00%");
    expect(rows[0]).toHaveTextContent("1K USDT");
  });
});

describe("CoinLogo", () => {
  it("falls back to the first letter", () => {
    render(<CoinLogo symbol="BTC" />);
    expect(screen.getByText("B")).toHaveAttribute("aria-hidden", "true");
  });

  it("sends no referrer to the logo's host", () => {
    const { container } = render(<CoinLogo symbol="BTC" src="https://x/btc.png" />);
    expect(container.querySelector("img")).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
