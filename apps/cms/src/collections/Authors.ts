import type { CollectionConfig } from "payload";
import { isEditor } from "../access/roles";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks/revalidate";
import { slugField } from "../fields";

export const Authors: CollectionConfig = {
  slug: "authors",
  admin: { useAsTitle: "name", group: "Content" },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  hooks: { afterChange: [revalidateAfterChange], afterDelete: [revalidateAfterDelete] },
  fields: [
    { name: "name", type: "text", required: true, localized: true },
    slugField(),
    { name: "bio", type: "textarea", localized: true },
    { name: "avatar", type: "upload", relationTo: "media" },
    { name: "user", type: "relationship", relationTo: "users", admin: { position: "sidebar" } },
  ],
};
