import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { REVALIDATE_SECRET } from "../playwright.config";

test("the blog lists articles translated into the page's language", async ({ page }) => {
  await page.goto("/en/blog");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blog");
  await expect(page.getByRole("link", { name: "What is Bitcoin?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Weekly market review" })).toBeVisible();
  // Persian only: not in the English list.
  await expect(page.getByText("راهنمای خرید با تومان")).toHaveCount(0);

  await page.goto("/fa/blog");
  await expect(page.getByRole("link", { name: "راهنمای خرید با تومان" })).toBeVisible();
});

test("an article shows its body, sources, coin card, and hreflang links", async ({ page }) => {
  await page.goto("/en/blog/what-is-bitcoin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What is Bitcoin?");
  await expect(page.getByText("Bitcoin is the first cryptocurrency.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bitcoin whitepaper" })).toHaveAttribute(
    "rel",
    "noopener noreferrer nofollow",
  );
  await expect(page.getByRole("link", { name: "View Bitcoin" })).toBeVisible();
  await expect(page.locator('link[rel="alternate"][hreflang="fa"]')).toHaveAttribute(
    "href",
    /\/fa\/blog\/what-is-bitcoin$/,
  );
  await page.getByRole("link", { name: "Education" }).first().click();
  await expect(page).toHaveURL(/\/en\/blog\/categories\/education$/);
});

test("a missing translation falls back to Persian, marked and not indexed", async ({ page }) => {
  await page.goto("/en/blog/toman-guide");
  await expect(page.getByRole("note")).toContainText("not available in English yet");
  await expect(page.locator("article")).toHaveAttribute("lang", "fa");
  await expect(page.locator("article")).toHaveAttribute("dir", "rtl");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // Translated title, Persian body: only the body is marked.
  await page.goto("/en/blog/weekly-market-review");
  await expect(page.getByRole("note")).toContainText("Parts of this page are not translated");
  await expect(page.getByText("بازار این هفته آرام بود.")).toBeVisible();
});

test("campaigns show their state, and an ended one keeps its page", async ({ page }) => {
  await page.goto("/en/campaigns");
  await expect(page.getByRole("listitem").filter({ hasText: "Welcome campaign" })).toContainText(
    "Running",
  );
  await expect(page.getByRole("listitem").filter({ hasText: "Summer campaign" })).toContainText(
    "Ended",
  );
  await page.goto("/en/campaigns/summer");
  await expect(page.getByRole("note")).toContainText("This campaign has ended");
  await expect(page.getByRole("link", { name: "Join" })).toHaveCount(0);

  await page.goto("/en/campaigns/welcome");
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Terms and conditions" })).toBeVisible();
});

test("the coin page links to articles about the coin", async ({ page }) => {
  await page.goto("/en/coins/bitcoin");
  await expect(page.getByRole("heading", { name: "Articles about Bitcoin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "What is Bitcoin?" })).toBeVisible();
});

test("the revalidation webhook accepts only signed calls", async ({ request }) => {
  const body = JSON.stringify({ tags: ["cms:articles", "cms:articles:what-is-bitcoin"] });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", REVALIDATE_SECRET).update(`${t}.${body}`).digest("hex");
  const signed = await request.post("/api/revalidate", {
    data: body,
    headers: { "content-type": "application/json", "x-signature": `t=${t},v1=${v1}` },
  });
  expect(signed.status()).toBe(200);
  const unsigned = await request.post("/api/revalidate", { data: body });
  expect(unsigned.status()).toBe(401);
});

test("a signed preview link shows the draft until preview is left", async ({ page }) => {
  const target = { collection: "articles", slug: "what-is-bitcoin", locale: "en" };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = createHmac("sha256", REVALIDATE_SECRET)
    .update(`preview.${target.collection}.${target.slug}.${target.locale}.${exp}`)
    .digest("hex");
  await page.goto(`/api/preview?${new URLSearchParams({ ...target, exp: String(exp), sig })}`);
  await expect(page).toHaveURL(/\/en\/blog\/what-is-bitcoin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft: what is Bitcoin?");
  await expect(page.getByRole("status")).toContainText("unpublished draft");
  await page.getByRole("link", { name: "Exit preview" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What is Bitcoin?");
});
