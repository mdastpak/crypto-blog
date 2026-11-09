import { expect, test } from "@playwright/test";

test("the markets list every listed currency against each quote, fiat only as a quote", async ({
  page,
}) => {
  await page.goto("/en/markets");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Markets");
  const table = page.getByRole("table", { name: "Markets" });
  // BTC and ETH against USDT and IRT (an ir release); no IRT/... market.
  await expect(table.getByRole("row")).toHaveCount(5);
  const btc = table.getByRole("row").filter({ hasText: "BTC/USDT" });
  // The median of the fresh, non-outlier USDT venues: 64,000 and 64,100.
  await expect(btc).toContainText("64,050");
  await expect(table.getByRole("row").filter({ hasText: "BTC/IRT" })).toContainText(
    "6,500,000,000",
  );
  await expect(table.getByRole("row").filter({ hasText: "ETH/USDT" })).toContainText("—");
  await btc.getByRole("link").click();
  await expect(page).toHaveURL(/\/en\/markets\/btc-usdt$/);
});

test("a market compares its venues, marking stale and outlier prices", async ({ page }) => {
  await page.goto("/en/markets/btc-usdt");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BTC/USDT");
  const venues = page.getByRole("table", { name: "BTC/USDT price at each exchange" });
  // Only USDT venues: Binance, Kraken, Tinyex (outlier), Oldex (stale).
  await expect(venues.getByRole("row")).toHaveCount(5);
  await expect(venues.getByRole("row").filter({ hasText: "Tinyex" })).toContainText("Outlier");
  await expect(venues.getByRole("row").filter({ hasText: "Oldex" })).toContainText("Stale");
  await expect(venues).not.toContainText("Nobitex");
  await expect(page.getByText("Stale and outlier prices are listed")).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC/IRT" })).toBeVisible();
  await expect(page.getByRole("link", { name: "About Bitcoin" })).toHaveAttribute(
    "href",
    "/en/coins/bitcoin",
  );
});

test("unknown, fiat, and non-canonical markets are not found", async ({ page }) => {
  for (const path of [
    "/en/markets/doge-usdt",
    "/en/markets/irt-usdt",
    "/en/markets/btc-eur",
    "/en/markets/BTC-USDT",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
