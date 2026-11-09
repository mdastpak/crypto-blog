import { expect, test } from "@playwright/test";

test("the root redirects to the default locale", async ({ browser }) => {
  // A browser language that the release does not serve.
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/fa$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("کریپتو بلاگ");
  await context.close();
});

test("the browser's language is honored", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await context.close();
});

test("the locale switcher keeps the page and the choice", async ({ page }) => {
  await page.goto("/fa");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

test("the theme persists without a flash", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "Theme" })).toHaveValue("dark");
});

test("an unknown page is a localized 404", async ({ page }) => {
  const response = await page.goto("/en/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

test("liveness and readiness answer", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ status: "ok" });
});
