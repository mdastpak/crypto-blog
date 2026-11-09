import "server-only";
import type { Locale } from "@/i18n/locales";
import { getConfig } from "@/lib/config";
import { CircuitBreaker } from "../backend/breaker";
import { CmsClient, type Where } from "./client";
import {
  articleSchema,
  authorSchema,
  campaignSchema,
  pageOf,
  taxonomySchema,
  type Article,
  type ArticleType,
  type Author,
  type Campaign,
  type Page,
  type Taxonomy,
} from "./schemas";
import { cmsTags } from "./tags";

/**
 * How long CMS answers are served from the cache, in seconds. Publishing
 * revalidates the affected tags at once (/api/revalidate); this lifetime
 * only bounds how stale a page gets if that call is lost.
 */
export const CMS_REVALIDATE = 300;

const KEY = Symbol.for("crypto-blog.cms");
const store = globalThis as typeof globalThis & { [KEY]?: CmsClient };

/** Whether this release shows editorial content (CMS_API_URL is set). */
export function cmsEnabled(): boolean {
  return !!getConfig().cmsApiUrl;
}

function client(): CmsClient {
  const config = getConfig();
  if (!config.cmsApiUrl) throw new Error("CMS_API_URL is not set");
  store[KEY] ??= new CmsClient({
    baseUrl: config.cmsApiUrl,
    timeoutMs: config.backendTimeoutMs,
    previewApiKey: config.cmsPreviewApiKey,
    breaker: new CircuitBreaker(),
  });
  return store[KEY];
}

/** Hides documents limited to another region, or to another site than this deployment's. */
export function visibility(region: string, siteId?: string): Where[] {
  const only = (field: string, value: string): Where => ({
    or: [{ [field]: { exists: false } }, { [field]: { contains: value } }],
  });
  return siteId ? [only("regions", region), only("sites", siteId)] : [only("regions", region)];
}

function visible(): Where[] {
  const { region, siteId } = getConfig();
  return visibility(region, siteId);
}

// Lists show related names and covers, so a change to those refreshes them too.
const RELATED = ["authors", "categories", "tags", "media"].map(cmsTags.collection);

const LIST_FIELDS = [
  "slug",
  "type",
  "title",
  "excerpt",
  "cover",
  "author",
  "categories",
  "publishedAt",
  "coins",
];

export interface ArticleFilter {
  type?: ArticleType;
  categoryId?: Taxonomy["id"];
  tagId?: Taxonomy["id"];
  authorId?: Author["id"];
  coin?: string;
}

/** Published articles translated into `locale`, newest first. */
export async function listArticles(
  locale: Locale,
  { page = 1, limit = 12, ...filter }: ArticleFilter & { page?: number; limit?: number } = {},
): Promise<Page<Article>> {
  const and: Where[] = [...visible(), { [`title.${locale}`]: { exists: true } }];
  if (filter.type) and.push({ type: { equals: filter.type } });
  if (filter.categoryId !== undefined) and.push({ categories: { in: filter.categoryId } });
  if (filter.tagId !== undefined) and.push({ tags: { in: filter.tagId } });
  if (filter.authorId !== undefined) and.push({ author: { equals: filter.authorId } });
  if (filter.coin) and.push({ coins: { contains: filter.coin } });
  return client().find("articles", pageOf(articleSchema), {
    where: { and },
    sort: "-publishedAt",
    limit,
    page,
    select: LIST_FIELDS,
    revalidate: CMS_REVALIDATE,
    tags: [cmsTags.collection("articles"), ...RELATED],
  });
}

async function findOne<T>(
  collection: string,
  schema: Parameters<CmsClient["find"]>[1],
  slug: string,
  options: { draft?: boolean; filter?: boolean } = {},
): Promise<T | undefined> {
  const and: Where[] = [{ slug: { equals: slug } }];
  // A preview shows the document wherever it will appear.
  if (options.filter && !options.draft) and.push(...visible());
  const page = (await client().find(collection, pageOf(schema), {
    where: { and },
    limit: 1,
    depth: 1,
    draft: options.draft,
    revalidate: CMS_REVALIDATE,
    tags: [cmsTags.collection(collection), cmsTags.doc(collection, slug), ...RELATED],
  })) as Page<T>;
  return page.docs[0];
}

export const getArticle = (slug: string, draft = false) =>
  findOne<Article>("articles", articleSchema, slug, { draft, filter: true });

export const getCampaign = (slug: string, draft = false) =>
  findOne<Campaign>("campaigns", campaignSchema, slug, { draft, filter: true });

export const getCategory = (slug: string) => findOne<Taxonomy>("categories", taxonomySchema, slug);

export const getTag = (slug: string) => findOne<Taxonomy>("tags", taxonomySchema, slug);

export const getAuthor = (slug: string) => findOne<Author>("authors", authorSchema, slug);

/** Published campaigns translated into `locale`, the latest start first. */
export async function listCampaigns(
  locale: Locale,
  { page = 1, limit = 12 }: { page?: number; limit?: number } = {},
): Promise<Page<Campaign>> {
  return client().find("campaigns", pageOf(campaignSchema), {
    where: { and: [...visible(), { [`title.${locale}`]: { exists: true } }] },
    sort: "-startsAt",
    limit,
    page,
    select: ["slug", "title", "summary", "cover", "startsAt", "endsAt"],
    revalidate: CMS_REVALIDATE,
    tags: [cmsTags.collection("campaigns"), cmsTags.collection("media")],
  });
}

/** Where a campaign stands at `now`. */
export function campaignState(
  campaign: Pick<Campaign, "startsAt" | "endsAt">,
  now = Date.now(),
): "upcoming" | "running" | "ended" {
  if (Date.parse(campaign.startsAt) > now) return "upcoming";
  if (campaign.endsAt && Date.parse(campaign.endsAt) <= now) return "ended";
  return "running";
}
