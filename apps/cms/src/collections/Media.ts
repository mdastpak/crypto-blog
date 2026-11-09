import type { CollectionConfig } from "payload";
import { isEditor, isWriter } from "../access/roles";

export const Media: CollectionConfig = {
  slug: "media",
  admin: { group: "Content" },
  access: { read: () => true, create: isWriter, update: isWriter, delete: isEditor },
  upload: {
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml"],
    imageSizes: [
      { name: "thumbnail", width: 400, height: 225, position: "centre" },
      { name: "card", width: 768, height: 432, position: "centre" },
      { name: "hero", width: 1600, height: 900, position: "centre" },
      { name: "og", width: 1200, height: 630, position: "centre" },
    ],
    focalPoint: true,
  },
  fields: [
    { name: "alt", type: "text", required: true, localized: true },
    { name: "credit", type: "text" },
  ],
};
