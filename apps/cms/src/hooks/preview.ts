import type { CollectionConfig } from "payload";
import { previewUrl } from "./signature";

let settings: { webUrl?: string; secret: string } = { secret: "" };

/** Set once from the configuration. */
export function configurePreview(next: { webUrl?: string; secret: string }): void {
  settings = next;
}

/**
 * The admin panel's "Preview" link of a document, or none when previews are
 * not set up or the document has no slug yet.
 */
export const preview =
  (collection: string): NonNullable<NonNullable<CollectionConfig["admin"]>["preview"]> =>
  (doc, { locale }) => {
    const slug = (doc as { slug?: unknown }).slug;
    if (!settings.webUrl || !settings.secret || typeof slug !== "string" || !slug) return null;
    return previewUrl(settings.webUrl, { collection, slug, locale }, settings.secret);
  };
