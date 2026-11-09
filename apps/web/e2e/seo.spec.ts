import { expect, test } from "@playwright/test";

const jsonLd = async (page: import("@playwright/test").Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
    (t) => JSON.parse(t) as Record<string, unknown> | Record<string, unknown>[],
  );

test("robots.txt allows pages, hides the API, and names the sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /api/");
  expect(body).toMatch(/Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
});

test("the sitemap index lists a file per type and locale", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.headers()["content-type"]).toContain("application/xml");
  const body = await response.text();
  for (const name of [
    "pages-fa",
    "coins-en-0",
    "markets-fa",
    "articles-en",
    "campaigns-fa",
    "news",
  ]) {
    expect(body).toContain(`/sitemaps/${name}.xml`);
  }
});

test("the coin sitemap comes from the feed, with hreflang, and leaves out removed coins", async ({
  request,
}) => {
  const body = await (await request.get("/sitemaps/coins-en-0.xml")).text();
  expect(body).toContain("<loc>http://127.0.0.1:3100/en/coins/bitcoin</loc>");
  expect(body).toContain('hreflang="fa" href="http://127.0.0.1:3100/fa/coins/bitcoin"');
  expect(body).toContain('hreflang="x-default" href="http://127.0.0.1:3100/fa/coins/bitcoin"');
  expect(body).not.toContain("terra-classic");
  expect((await request.get("/sitemaps/coins-en-7.xml")).status()).toBe(404);
  expect((await request.get("/sitemaps/nonsense.xml")).status()).toBe(404);
});

test("articles link only their translations; recent news is in the news sitemap", async ({
  request,
}) => {
  const articles = await (await request.get("/sitemaps/articles-fa.xml")).text();
  expect(articles).toContain("/fa/blog/toman-guide</loc>");
  // Persian only: no English alternate.
  expect(articles).not.toContain("/en/blog/toman-guide");
  const news = await (await request.get("/sitemaps/news.xml")).text();
  expect(news).toContain("<news:title>Ether upgrade ships</news:title>");
  expect(news).toContain("<news:language>en</news:language>");
  expect(news).not.toContain("toman-guide");
});

test("a coin page has canonical, hreflang, Open Graph, and the catalog's JSON-LD", async ({
  page,
}) => {
  await page.goto("/en/coins/bitcoin");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/en\/coins\/bitcoin$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    "href",
    /\/fa\/coins\/bitcoin$/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/og\/coins\/bitcoin$/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  const data = (await jsonLd(page)).flat();
  const thing = data.find((d) => d["@type"] === "Thing")!;
  expect(thing).toMatchObject({
    name: "Bitcoin",
    sameAs: ["https://bitcoin.org"],
    url: expect.stringMatching(/\/en\/coins\/bitcoin$/),
  });
  const crumbs = data.find((d) => d["@type"] === "BreadcrumbList")!;
  expect(crumbs.itemListElement).toHaveLength(3);
});

test("the coin's Open Graph image is a PNG", async ({ request }) => {
  const response = await request.get("/og/coins/bitcoin");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("a removed coin answers 410 Gone", async ({ request }) => {
  // The copy of the catalog syncs at start-up; the sitemap waits for it.
  await request.get("/sitemaps/coins-en-0.xml");
  const response = await request.get("/en/coins/terra-classic", { maxRedirects: 0 });
  expect(response.status()).toBe(410);
  expect(await response.text()).toContain("no longer listed");
});

test("a news article has NewsArticle JSON-LD with its sources and no person as author", async ({
  page,
}) => {
  await page.goto("/en/blog/ether-upgrade-ships-4-abc");
  const article = (await jsonLd(page)).flat().find((d) => d["@type"] === "NewsArticle")!;
  expect(article).toMatchObject({
    headline: "Ether upgrade ships",
    inLanguage: "en",
    author: { "@type": "Organization" },
    citation: [
      { name: "Wire", url: "https://wire.example/eth" },
      { name: "Daily", url: "https://daily.example/eth" },
    ],
  });
});

test("the home page names the organization and the site", async ({ page }) => {
  await page.goto("/fa");
  const types = (await jsonLd(page)).flat().map((d) => d["@type"]);
  expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
  await expect(page).toHaveTitle("کریپتو بلاگ");
});
