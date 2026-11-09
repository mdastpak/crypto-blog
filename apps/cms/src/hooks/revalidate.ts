import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";
import { sign } from "./signature";

/** The cache tags of a document, which the web app revalidates. */
export function tagsFor(collection: string, doc: { slug?: unknown; id?: unknown }): string[] {
  const tags = [`cms:${collection}`];
  if (typeof doc.slug === "string" && doc.slug) tags.push(`cms:${collection}:${doc.slug}`);
  return tags;
}

export interface RevalidateTarget {
  urls: string[];
  secret: string;
}

type Fetch = typeof fetch;

/**
 * Tells every web deployment to revalidate the tags, with up to three tries
 * each. It never throws: a missed call only delays the change until the
 * web app's own cache lifetime ends (5 minutes for CMS content).
 */
export async function sendRevalidation(
  target: RevalidateTarget,
  tags: string[],
  log: (msg: string) => void,
  fetchFn: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  if (target.urls.length === 0 || !target.secret) return;
  const body = JSON.stringify({ tags });
  await Promise.all(
    target.urls.map(async (url) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetchFn(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Signature": sign(body, target.secret),
            },
            body,
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) return;
          if (response.status < 500 && response.status !== 429) break;
        } catch {
          // retried below
        }
        await sleep(500 * 2 ** attempt);
      }
      log(`revalidation of ${tags.join(", ")} at ${url} failed`);
    }),
  );
}

let target: RevalidateTarget = { urls: [], secret: "" };

/** Set once from the configuration. */
export function configureRevalidation(next: RevalidateTarget): void {
  target = next;
}

/**
 * Revalidates after a change. A draft save changes nothing public, so only
 * a published document, or one that was published before (now unpublished),
 * triggers it. The call does not hold the editor's save.
 */
export const revalidateAfterChange: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  collection,
  req,
}) => {
  const status = (doc as { _status?: string })._status;
  const was = (previousDoc as { _status?: string } | undefined)?._status;
  const hasDrafts = !!collection.versions?.drafts;
  if (hasDrafts && status !== "published" && was !== "published") return doc;
  const tags = [
    ...new Set([...tagsFor(collection.slug, doc), ...tagsFor(collection.slug, previousDoc ?? {})]),
  ];
  void sendRevalidation(target, tags, (msg) => req.payload.logger.warn(msg));
  return doc;
};

export const revalidateAfterDelete: CollectionAfterDeleteHook = ({ doc, collection, req }) => {
  void sendRevalidation(target, tagsFor(collection.slug, doc), (msg) =>
    req.payload.logger.warn(msg),
  );
  return doc;
};
