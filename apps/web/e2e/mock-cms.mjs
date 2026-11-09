// A stand-in for the CMS's REST API (Payload, `locale=all`) in end-to-end
// tests: a few documents and enough of Payload's query syntax for the
// blog's requests.

const PREVIEW_KEY = process.env.MOCK_PREVIEW_KEY ?? "e2e-preview-key-0123456789abcdef";

const lexical = (text) => ({
  root: {
    children: [
      { type: "heading", tag: "h2", children: [{ type: "text", text: "Intro" }] },
      { type: "paragraph", children: [{ type: "text", text }] },
    ],
  },
});

const newsroom = { id: 1, slug: "newsroom", name: { fa: "تحریریه", en: "Newsroom" }, bio: {} };
const education = {
  id: 1,
  slug: "education",
  name: { fa: "آموزش", en: "Education" },
  description: {},
};

const articles = [
  {
    id: 1,
    slug: "what-is-bitcoin",
    type: "guide",
    title: { fa: "بیت‌کوین چیست؟", en: "What is Bitcoin?" },
    excerpt: { fa: "آشنایی با بیت‌کوین.", en: "An introduction to Bitcoin." },
    body: {
      fa: lexical("بیت‌کوین اولین رمزارز است."),
      en: lexical("Bitcoin is the first cryptocurrency."),
    },
    coins: ["bitcoin"],
    sources: [{ name: "Bitcoin whitepaper", url: "https://bitcoin.org/bitcoin.pdf" }],
    author: newsroom,
    categories: [education],
    tags: [],
    publishedAt: "2026-11-08T10:00:00Z",
    _status: "published",
  },
  {
    // Translated title, body only in Persian: the body falls back.
    id: 2,
    slug: "weekly-market-review",
    type: "analysis",
    title: { fa: "مرور هفتگی بازار", en: "Weekly market review" },
    excerpt: { fa: "نگاهی به بازار.", en: "A look at the market." },
    body: { fa: lexical("بازار این هفته آرام بود."), en: null },
    coins: [],
    author: newsroom,
    categories: [],
    tags: [],
    publishedAt: "2026-11-07T10:00:00Z",
    _status: "published",
  },
  {
    // Persian only: not listed in English, shown in Persian when opened.
    id: 3,
    slug: "toman-guide",
    type: "news",
    title: { fa: "راهنمای خرید با تومان", en: null },
    excerpt: { fa: "خرید رمزارز با تومان." },
    body: { fa: lexical("متن فارسی.") },
    coins: [],
    categories: [],
    tags: [],
    publishedAt: "2026-11-06T10:00:00Z",
    _status: "published",
  },
];

const drafts = {
  "what-is-bitcoin": {
    ...articles[0],
    title: { fa: "پیش‌نویس", en: "Draft: what is Bitcoin?" },
    _status: "draft",
  },
};

const day = 86_400_000;
const campaigns = [
  {
    id: 1,
    slug: "welcome",
    title: { fa: "کمپین خوش‌آمدگویی", en: "Welcome campaign" },
    summary: { fa: "برای کاربران جدید.", en: "For new users." },
    body: { en: lexical("Join and get a bonus.") },
    terms: { en: lexical("One bonus per person.") },
    startsAt: new Date(Date.now() - day).toISOString(),
    endsAt: new Date(Date.now() + 30 * day).toISOString(),
    cta: { label: { en: "Get started" }, url: "/en/coins" },
    coins: [],
    _status: "published",
  },
  {
    id: 2,
    slug: "summer",
    title: { fa: "کمپین تابستان", en: "Summer campaign" },
    summary: { en: "Last summer's campaign." },
    body: {},
    terms: {},
    startsAt: "2026-06-01T00:00:00Z",
    endsAt: "2026-08-31T00:00:00Z",
    cta: { label: { en: "Join" }, url: "/en" },
    coins: [],
    _status: "published",
  },
];

const collections = {
  articles,
  campaigns,
  authors: [newsroom],
  categories: [education],
  tags: [],
};

function page(docs) {
  return { docs, totalDocs: docs.length, page: 1, totalPages: 1, hasNextPage: false };
}

/** Handles /cms/api/*; returns false for other paths. */
export function handleCms(req, res, url) {
  if (!url.pathname.startsWith("/cms/api/")) return false;
  const rest = url.pathname.slice("/cms/api/".length);
  if (rest.startsWith("media/file/")) {
    res.setHeader("content-type", "image/png");
    // A 1×1 transparent PNG.
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return true;
  }
  res.setHeader("content-type", "application/json");
  let docs = collections[rest];
  if (!docs) {
    res.statusCode = 404;
    res.end(JSON.stringify({ errors: [{ message: "Not Found" }] }));
    return true;
  }
  const params = [...url.searchParams];
  const value = (suffix) => params.find(([k]) => k.endsWith(suffix))?.[1];
  const slug = value("[slug][equals]");
  const locale = params
    .find(([k]) => /\[title\.\w+\]\[exists\]$/.test(k))?.[0]
    .match(/title\.(\w+)/)?.[1];
  const coin = value("[coins][contains]");
  const draft = url.searchParams.get("draft") === "true";
  if (draft && req.headers.authorization !== `users API-Key ${PREVIEW_KEY}`) {
    res.statusCode = 403;
    res.end(JSON.stringify({ errors: [{ message: "Forbidden" }] }));
    return true;
  }
  if (slug) docs = docs.filter((d) => d.slug === slug);
  if (draft && rest === "articles") docs = docs.map((d) => drafts[d.slug] ?? d);
  if (locale) docs = docs.filter((d) => d.title?.[locale]);
  if (coin) docs = docs.filter((d) => d.coins?.includes(coin));
  res.end(JSON.stringify(page(docs)));
  return true;
}
