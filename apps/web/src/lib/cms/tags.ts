/**
 * Cache tags of CMS content, the same strings the CMS sends to
 * /api/revalidate (apps/cms/src/hooks/revalidate.ts): a change to an
 * article revalidates its page and the lists, and nothing else.
 */
export const cmsTags = {
  collection: (collection: string) => `cms:${collection}`,
  doc: (collection: string, slug: string) => `cms:${collection}:${slug}`,
};

/** Tags the web app accepts from the CMS. */
export function isCmsTag(tag: unknown): tag is string {
  return typeof tag === "string" && /^cms:[a-z-]+(:[a-z0-9-]{1,120})?$/.test(tag);
}
