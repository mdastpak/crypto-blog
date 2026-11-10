import { render, screen, within } from "@testing-library/react";
import type { VenueQuote } from "@/lib/backend/schemas";
import { CoinLogo } from "./CoinLogo";
import { CoinTable, type CoinRow } from "./CoinTable";
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
    render(<CoinLogo symbol="BTC" hosts={[]} />);
    expect(screen.getByText("B")).toHaveAttribute("aria-hidden", "true");
  });

  it("serves the logo from this app, never from its source's host", () => {
    const { container } = render(
      <CoinLogo symbol="BTC" src="https://logos.example/btc.png" hosts={["logos.example"]} />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/coin-logo?u=https%3A%2F%2Flogos.example%2Fbtc.png",
    );
  });

  it("shows the letter for a logo on a host that is not allowed", () => {
    render(
      <CoinLogo symbol="BTC" src="https://elsewhere.example/btc.png" hosts={["logos.example"]} />,
    );
    expect(screen.getByText("B")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CoinTable", () => {
  const rows: CoinRow[] = [
    {
      asset: {
        slug: "pepe",
        symbol: "PEPE",
        name: "Pepe",
        verified: false,
        logo_url: "",
        created_at: "2026-11-05T08:00:00Z",
      },
      price: {
        price: 0.00001,
        quote: "USDT",
        venues: 3,
        observedAt: "2026-11-09T10:00:00Z",
        chartVenue: "binance",
      },
    },
    { asset: { slug: "bonk", symbol: "BONK", name: "Bonk", verified: true, logo_url: "" } },
  ];

  it("lists the coins without the added column by default", () => {
    render(<CoinTable locale="en" caption="Top" rows={rows} empty="None" />);
    const table = screen.getByRole("table", { name: "Top" });
    expect(within(table).queryByRole("columnheader", { name: "Added" })).toBeNull();
    const pepe = within(table).getByRole("row", { name: /Pepe/ });
    expect(pepe).toHaveTextContent("Unverified");
    expect(within(pepe).getByRole("link")).toHaveAttribute("href", "/en/coins/pepe");
    expect(within(table).getByRole("row", { name: /Bonk/ })).not.toHaveTextContent("Unverified");
  });

  it("shows the date added, Jalali in Persian, and a dash without one", () => {
    render(<CoinTable locale="fa" caption="New" rows={rows} empty="None" showAdded />);
    const table = screen.getByRole("table", { name: "New" });
    expect(within(table).getByRole("columnheader", { name: "تاریخ افزودن" })).toBeInTheDocument();
    const added = within(within(table).getByRole("row", { name: /Pepe/ })).getByText(
      "۱۴ آبان ۱۴۰۵",
    );
    expect(added.tagName).toBe("TIME");
    expect(added).toHaveAttribute("dateTime", "2026-11-05T08:00:00Z");
    expect(within(table).getByRole("row", { name: /Bonk/ })).toHaveTextContent("—");
  });

  it("shows the empty state without rows", () => {
    render(<CoinTable locale="en" caption="New" rows={[]} empty="No coins yet" />);
    expect(screen.getByText("No coins yet")).toBeInTheDocument();
  });
});
