import { expect, test } from "@playwright/test";

test("top coins lists the catalog with prices", async ({ page }) => {
  await page.goto("/en/coins");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Top cryptocurrencies by market cap",
  );
  const table = page.getByRole("table", { name: "Top cryptocurrencies by market cap" });
  const bitcoin = table.getByRole("row").filter({ hasText: "Bitcoin" });
  // The median of the usable USDT venues; the outlier is not counted.
  await expect(bitcoin).toContainText("64,050 USDT");
  await expect(bitcoin).toContainText("Unverified");
  await expect(table.getByRole("row").filter({ hasText: "Ethereum" })).toContainText("—");
  await bitcoin.getByRole("link").click();
  await expect(page).toHaveURL(/\/en\/coins\/bitcoin$/);
});

test("a coin page shows its price, venues, chart, and the unverified note", async ({ page }) => {
  await page.goto("/en/coins/bitcoin");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bitcoin");
  await expect(page).toHaveTitle(/Bitcoin \(BTC\) price/);
  await expect(page.getByRole("note")).toContainText("not listed on our exchange");
  await expect(page.getByText("64,050 USDT").first()).toBeVisible();
  const venues = page.getByRole("table", { name: "Bitcoin prices on each exchange" });
  await expect(venues.getByRole("row")).toHaveCount(6); // header + 5 venues, IRT shown in an ir release
  await expect(venues.getByRole("row").filter({ hasText: "Tinyex" })).toContainText("Outlier");
  await expect(
    page.getByRole("img", { name: /daily closing price in USDT at binance/ }),
  ).toBeVisible();
  await expect(page.getByText("Source: Data provided by CoinGecko")).toBeVisible();
});

test("a coin page in Persian is right to left with Persian digits", async ({ page }) => {
  await page.goto("/fa/coins/bitcoin");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("۶۴٬۰۵۰ USDT").first()).toBeVisible();
});

test("an unknown coin is a 404", async ({ page }) => {
  const response = await page.goto("/en/coins/no-such-coin");
  expect(response?.status()).toBe(404);
});

test("coin logos come from this site, never from a third-party host", async ({ page, baseURL }) => {
  // Hosts, not origins: the policy's upgrade-insecure-requests turns the
  // test server's http into https, on the same host.
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).hostname));
  await page.goto("/en/coins");
  const table = page.getByRole("table", { name: "Top cryptocurrencies by market cap" });
  const bitcoin = table.getByRole("row").filter({ hasText: "Bitcoin" });
  await expect(bitcoin.locator("img")).toHaveAttribute(
    "src",
    "/coin-logo?u=https%3A%2F%2Flogos.test%2Fbtc.png",
  );
  // Not an allowed host: the letter, and no request anywhere.
  await expect(table.getByRole("row").filter({ hasText: "Ethereum" }).locator("img")).toHaveCount(
    0,
  );
  await page.waitForLoadState("networkidle");
  expect([...hosts]).toEqual([new URL(baseURL!).hostname]);
});
