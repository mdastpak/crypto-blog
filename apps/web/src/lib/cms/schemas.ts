import { z } from "zod";

/**
 * The CMS's REST answers, read with `locale=all`: every localized field is
 * an object of its translations (`{ fa: "…", en: null }`), and the blog
 * chooses among them (localize.ts). Unknown fields are ignored, so the CMS
 * can add fields before the blog shows them.
 */

/** A localized value; a missing locale and `null` both mean "not translated". */
export const localized = <T extends z.ZodType>(value: T) =>
  z
    .record(z.string(), value.nullable().optional())
    .nullable()
    .optional()
    .transform((v) => v ?? {});
export type Localized<T> = Partial<Record<string, T | null | undefined>>;

/** A Lexical document; its nodes are checked one by one when rendered. */
export const richTextSchema = z.object({
  root: z.object({ children: z.array(z.unknown()) }).loose(),
});
export type RichText = z.infer<typeof richTextSchema>;

const imageSize = z.object({
  filename: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

export const mediaSchema = z.object({
  id: z.union([z.number(), z.string()]),
  filename: z.string().nullish(),
  mimeType: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  alt: localized(z.string()),
  sizes: z.record(z.string(), imageSize).nullish(),
});
export type Media = z.infer<typeof mediaSchema>;

/**
 * A relation: the document when the request's depth reached it, otherwise
 * its id, which the blog treats as missing.
 */
const relation = <T extends z.ZodType>(doc: T) =>
  z
    .union([doc, z.number(), z.string()])
    .nullish()
    .transform((v) => (v === null || v === undefined || typeof v !== "object" ? undefined : v));
const relations = <T extends z.ZodType>(doc: T) =>
  z
    .array(z.union([doc, z.number(), z.string()]))
    .nullish()
    .transform((list) =>
      (list ?? []).filter((v): v is Exclude<typeof v, number | string> => typeof v === "object"),
    );

export const taxonomySchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string(),
  name: localized(z.string()),
  description: localized(z.string()),
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const authorSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string(),
  name: localized(z.string()),
  bio: localized(z.string()),
  avatar: relation(mediaSchema),
});
export type Author = z.infer<typeof authorSchema>;

const seoSchema = z
  .object({ title: localized(z.string()), description: localized(z.string()) })
  .nullish()
  .transform((v) => v ?? { title: {}, description: {} });

export const ARTICLE_TYPES = ["article", "guide", "analysis", "news"] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const articleSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string(),
  type: z.enum(ARTICLE_TYPES).catch("article"),
  title: localized(z.string()),
  excerpt: localized(z.string()),
  body: localized(richTextSchema),
  cover: relation(mediaSchema),
  coins: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  sources: z
    .array(z.object({ name: z.string(), url: z.string() }))
    .nullish()
    .transform((v) => v ?? []),
  author: relation(authorSchema),
  categories: relations(taxonomySchema),
  tags: relations(taxonomySchema),
  publishedAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  seo: seoSchema,
  _status: z.enum(["draft", "published"]).nullish(),
});
export type Article = z.infer<typeof articleSchema>;

export const campaignSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string(),
  title: localized(z.string()),
  summary: localized(z.string()),
  body: localized(richTextSchema),
  terms: localized(richTextSchema),
  cover: relation(mediaSchema),
  startsAt: z.string(),
  endsAt: z.string().nullish(),
  cta: z
    .object({ label: localized(z.string()), url: z.string().nullish() })
    .nullish()
    .transform((v) => v ?? { label: {}, url: undefined }),
  coins: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  updatedAt: z.string().nullish(),
  seo: seoSchema,
  _status: z.enum(["draft", "published"]).nullish(),
});
export type Campaign = z.infer<typeof campaignSchema>;

/** A page of a collection. */
export const pageOf = <T extends z.ZodType>(doc: T) =>
  z.object({
    docs: z.array(doc),
    totalDocs: z.number(),
    page: z
      .number()
      .nullish()
      .transform((v) => v ?? 1),
    totalPages: z.number(),
    hasNextPage: z.boolean().optional(),
  });
export interface Page<T> {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
}
