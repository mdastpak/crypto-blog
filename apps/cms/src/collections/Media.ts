import type { CollectionConfig } from "payload";
import { isEditor, isWriter } from "../access/roles";
import { mediaResponseHeaders } from "../security/headers";

/**
 * Raster images only. SVG is refused (#29): an SVG can carry script, and
 * the CMS serves its files from its own origin, where a script opened by
 * an editor or an admin would act with their session. Payload's own SVG
 * inspection is a pattern check, so the type is not accepted at all; brand
 * logos live in the web app's code. Files are served with a sandbox policy
 * as well, which also covers SVGs stored before this rule.
 */
export const MEDIA_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export const Media: CollectionConfig = {
  slug: "media",
  admin: { group: "Content" },
  access: { read: () => true, create: isWriter, update: isWriter, delete: isEditor },
  upload: {
    mimeTypes: MEDIA_MIME_TYPES,
    imageSizes: [
      { name: "thumbnail", width: 400, height: 225, position: "centre" },
      { name: "card", width: 768, height: 432, position: "centre" },
      { name: "hero", width: 1600, height: 900, position: "centre" },
      { name: "og", width: 1200, height: 630, position: "centre" },
    ],
    focalPoint: true,
    modifyResponseHeaders: ({ headers }) => mediaResponseHeaders(headers),
  },
  fields: [
    { name: "alt", type: "text", required: true, localized: true },
    { name: "credit", type: "text" },
  ],
};
