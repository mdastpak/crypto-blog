import type { Field } from "payload";

/** A URL-safe, unique slug shared by every locale of the document. */
export const slugField = (reserved: readonly string[] = []): Field => ({
  name: "slug",
  type: "text",
  required: true,
  unique: true,
  index: true,
  admin: {
    position: "sidebar",
    description: "Lowercase letters, digits, and dashes; used in the URL.",
  },
  validate: (value: unknown) => {
    if (
      typeof value !== "string" ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) ||
      value.length > 120
    ) {
      return "Use lowercase letters, digits, and single dashes (at most 120 characters).";
    }
    return reserved.includes(value) ? `"${value}" is taken by a page of the blog.` : true;
  },
});

/** The country sites a document appears on; none means every site. */
export const sitesField = (): Field => ({
  name: "sites",
  type: "text",
  hasMany: true,
  admin: { position: "sidebar", description: "Site ids (e.g. ir, global). Empty: every site." },
});

/** The release regions a document appears in; none means both. */
export const regionsField = (): Field => ({
  name: "regions",
  type: "select",
  hasMany: true,
  options: [
    { label: "Iran", value: "ir" },
    { label: "International", value: "international" },
  ],
  admin: { position: "sidebar", description: "Empty: both regions." },
});

/** Records who created a document, for the authors' own-drafts rule. */
export const createdByField = (): Field => ({
  name: "createdBy",
  type: "relationship",
  relationTo: "users",
  admin: { position: "sidebar", readOnly: true },
  hooks: {
    beforeChange: [
      ({ req, operation, value }) => (operation === "create" && req.user ? req.user.id : value),
    ],
  },
});

export const seoField = (): Field => ({
  name: "seo",
  type: "group",
  fields: [
    { name: "title", type: "text", localized: true, maxLength: 70 },
    { name: "description", type: "textarea", localized: true, maxLength: 160 },
  ],
});
