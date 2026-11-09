/**
 * Sample content in Persian and English for development:
 *
 *   pnpm --filter cms seed
 *
 * It creates an admin (admin@example.com / SEED_ADMIN_PASSWORD or
 * "change-me-please"), the news worker's account (newsbot@example.com, with
 * the API key SEED_NEWSBOT_API_KEY or "dev-newsbot-api-key-0123456789"), an author, categories, two published articles, a
 * draft, and a running campaign. It refuses to run in production and skips
 * what already exists, so it can run twice.
 */
import config from "@payload-config";
import { getPayload, type CollectionSlug } from "payload";
import { paragraphs } from "./lexical";

if (process.env.NODE_ENV === "production") {
  console.error("The seed is for development only.");
  process.exit(1);
}

const payload = await getPayload({ config });

async function upsert(
  collection: CollectionSlug,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  en?: Record<string, unknown>,
) {
  const found = await payload.find({ collection, where: where as never, limit: 1 });
  if (found.docs[0]) return found.docs[0];
  const doc = await payload.create({
    collection,
    data: data as never,
    locale: "fa",
    draft: data._status === "draft",
  });
  if (en) await payload.update({ collection, id: doc.id, data: en as never, locale: "en" });
  return doc;
}

const admin = await upsert(
  "users",
  { email: { equals: "admin@example.com" } },
  {
    email: "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "change-me-please",
    name: "Admin",
    roles: ["admin"],
  },
);
await upsert(
  "users",
  { email: { equals: "newsbot@example.com" } },
  {
    email: "newsbot@example.com",
    password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
    name: "News worker",
    roles: ["newsbot"],
    enableAPIKey: true,
    apiKey: process.env.SEED_NEWSBOT_API_KEY ?? "dev-newsbot-api-key-0123456789",
  },
);
const author = await upsert(
  "authors",
  { slug: { equals: "newsroom" } },
  { name: "تحریریه", slug: "newsroom", bio: "تیم تحریریه کریپتو بلاگ." },
  { name: "Newsroom", bio: "The Crypto Blog editorial team." },
);
const education = await upsert(
  "categories",
  { slug: { equals: "education" } },
  { name: "آموزش", slug: "education" },
  { name: "Education" },
);
const market = await upsert(
  "categories",
  { slug: { equals: "market" } },
  { name: "تحلیل بازار", slug: "market" },
  { name: "Market analysis" },
);

await upsert(
  "articles",
  { slug: { equals: "what-is-bitcoin" } },
  {
    title: "بیت‌کوین چیست؟",
    slug: "what-is-bitcoin",
    type: "guide",
    excerpt: "آشنایی با اولین رمزارز غیرمتمرکز و نحوه کار آن.",
    body: paragraphs(
      [
        "بیت‌کوین اولین رمزارز غیرمتمرکز است که در سال ۲۰۰۹ معرفی شد.",
        "تراکنش‌های آن روی یک دفتر کل عمومی به نام بلاکچین ثبت می‌شوند.",
      ],
      "rtl",
    ),
    coins: ["bitcoin"],
    author: author.id,
    categories: [education.id],
    _status: "published",
  },
  {
    title: "What is Bitcoin?",
    excerpt: "An introduction to the first decentralized cryptocurrency and how it works.",
    body: paragraphs(
      [
        "Bitcoin is the first decentralized cryptocurrency, introduced in 2009.",
        "Its transactions are recorded on a public ledger called the blockchain.",
      ],
      "ltr",
    ),
  },
);
await upsert(
  "articles",
  { slug: { equals: "weekly-market-review" } },
  {
    title: "مرور هفتگی بازار",
    slug: "weekly-market-review",
    type: "analysis",
    excerpt: "نگاهی به حرکت بیت‌کوین و اتریوم در هفته گذشته.",
    body: paragraphs(["بیت‌کوین و اتریوم این هفته در محدوده‌ای باریک نوسان کردند."], "rtl"),
    coins: ["bitcoin", "ethereum"],
    author: author.id,
    categories: [market.id],
    _status: "published",
  },
  { title: "Weekly market review", excerpt: "A look at Bitcoin and Ethereum over the past week." },
);
await upsert(
  "articles",
  { slug: { equals: "upcoming-draft" } },
  { title: "پیش‌نویس", slug: "upcoming-draft", _status: "draft", author: author.id },
);
await upsert(
  "campaigns",
  { slug: { equals: "welcome-campaign" } },
  {
    title: "کمپین خوش‌آمدگویی",
    slug: "welcome-campaign",
    summary: "برای کاربران جدید.",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    cta: { label: "شروع کنید", url: "/" },
    body: paragraphs(["جزئیات کمپین خوش‌آمدگویی."], "rtl"),
    _status: "published",
  },
  { title: "Welcome campaign", summary: "For new users.", cta: { label: "Get started" } },
);

payload.logger.info(`seeded; sign in as ${(admin as { email: string }).email}`);
process.exit(0);
