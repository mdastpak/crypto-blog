import type { CollectionConfig } from "payload";
import { isBotField, isEditor, isWriter, ownOrEditor, publishedOrStaff } from "../access/roles";
import { createdByField, regionsField, seoField, sitesField, slugField } from "../fields";
import { preview } from "../hooks/preview";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks/revalidate";
import { publishGuard } from "./publishGuard";

export const ARTICLE_TYPES = ["article", "guide", "analysis", "news"] as const;

export const Articles: CollectionConfig = {
  slug: "articles",
  admin: {
    useAsTitle: "title",
    preview: preview("articles"),
    group: "Content",
    defaultColumns: ["title", "type", "_status", "publishedAt", "updatedAt"],
  },
  versions: { drafts: { autosave: { interval: 2000 }, schedulePublish: true }, maxPerDoc: 50 },
  access: { read: publishedOrStaff, create: isWriter, update: ownOrEditor, delete: isEditor },
  hooks: {
    beforeChange: [publishGuard],
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    // Paths under /blog that are not articles.
    slugField(["categories", "tags", "authors"]),
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "article",
      options: ARTICLE_TYPES.map((v) => ({ label: v[0]!.toUpperCase() + v.slice(1), value: v })),
      admin: { position: "sidebar" },
    },
    { name: "excerpt", type: "textarea", localized: true, maxLength: 300 },
    { name: "cover", type: "upload", relationTo: "media" },
    { name: "body", type: "richText", localized: true },
    {
      name: "coins",
      type: "text",
      hasMany: true,
      admin: {
        description: "Slugs of the coins this is about (market data catalog), e.g. bitcoin.",
      },
    },
    {
      name: "sources",
      type: "array",
      admin: { description: "Where the facts come from; shown under news." },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "url", type: "text", required: true },
        // The source's own headline, in its language; news drafts fill it.
        { name: "title", type: "text" },
      ],
    },
    {
      name: "corrections",
      type: "array",
      admin: {
        description:
          "Updates and corrections after publishing, newest last; shown on the page with their time.",
      },
      fields: [
        {
          name: "at",
          type: "date",
          required: true,
          defaultValue: () => new Date(),
          admin: { date: { pickerAppearance: "dayAndTime" } },
        },
        {
          name: "kind",
          type: "select",
          required: true,
          defaultValue: "update",
          options: [
            { label: "Update", value: "update" },
            { label: "Correction", value: "correction" },
          ],
        },
        { name: "note", type: "textarea", required: true, localized: true, maxLength: 500 },
      ],
    },
    { name: "author", type: "relationship", relationTo: "authors", admin: { position: "sidebar" } },
    {
      name: "categories",
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
      admin: { position: "sidebar" },
    },
    {
      name: "tags",
      type: "relationship",
      relationTo: "tags",
      hasMany: true,
      admin: { position: "sidebar" },
    },
    {
      name: "publishedAt",
      type: "date",
      index: true,
      admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } },
      hooks: {
        // Set on the first publish; editors may backdate it.
        beforeChange: [
          ({ siblingData, value }) =>
            siblingData._status === "published" && !value ? new Date() : value,
        ],
      },
    },
    // Set by the news worker on the drafts it writes (docs/news.md).
    {
      name: "externalId",
      type: "text",
      unique: true,
      index: true,
      access: { create: isBotField, update: isBotField },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "The news worker's story this was drafted from.",
      },
    },
    {
      name: "generatedBy",
      type: "text",
      access: { create: isBotField, update: isBotField },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "The writer that drafted this; the page shows an editorial note.",
      },
    },
    {
      name: "autoPublished",
      type: "checkbox",
      defaultValue: false,
      access: { create: isBotField, update: isBotField },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Published by the news worker without review; labeled on the page.",
      },
    },
    sitesField(),
    regionsField(),
    seoField(),
    createdByField(),
  ],
};
