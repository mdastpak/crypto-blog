import type { CollectionConfig } from "payload";
import { isEditor } from "../access/roles";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks/revalidate";
import { slugField } from "../fields";

const taxonomy = (slug: string, title: string): CollectionConfig => ({
  slug,
  labels: { singular: title, plural: `${title.replace(/y$/, "ie")}s` },
  admin: { useAsTitle: "name", group: "Content" },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  hooks: { afterChange: [revalidateAfterChange], afterDelete: [revalidateAfterDelete] },
  fields: [
    { name: "name", type: "text", required: true, localized: true },
    slugField(),
    { name: "description", type: "textarea", localized: true },
  ],
});

export const Categories = taxonomy("categories", "Category");
export const Tags = taxonomy("tags", "Tag");
