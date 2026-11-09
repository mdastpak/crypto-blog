import type { CollectionConfig } from "payload";
import { isEditor, isWriter, ownOrEditor, publishedOrStaff } from "../access/roles";
import { createdByField, regionsField, seoField, sitesField, slugField } from "../fields";
import { preview } from "../hooks/preview";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks/revalidate";
import { publishGuard } from "./publishGuard";

export const Campaigns: CollectionConfig = {
  slug: "campaigns",
  admin: {
    useAsTitle: "title",
    preview: preview("campaigns"),
    group: "Content",
    defaultColumns: ["title", "startsAt", "endsAt", "_status"],
  },
  versions: { drafts: { schedulePublish: true }, maxPerDoc: 50 },
  access: { read: publishedOrStaff, create: isWriter, update: ownOrEditor, delete: isEditor },
  hooks: {
    beforeChange: [publishGuard],
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    slugField(),
    { name: "summary", type: "textarea", localized: true, maxLength: 300 },
    { name: "cover", type: "upload", relationTo: "media" },
    { name: "body", type: "richText", localized: true },
    {
      type: "row",
      fields: [
        {
          name: "startsAt",
          type: "date",
          required: true,
          admin: { date: { pickerAppearance: "dayAndTime" } },
        },
        {
          name: "endsAt",
          type: "date",
          admin: { date: { pickerAppearance: "dayAndTime" } },
          validate: (value: unknown, { siblingData }: { siblingData: { startsAt?: string } }) =>
            !value ||
            !siblingData.startsAt ||
            new Date(value as string) > new Date(siblingData.startsAt)
              ? true
              : "The end must be after the start.",
        },
      ],
    },
    {
      name: "cta",
      type: "group",
      fields: [
        { name: "label", type: "text", localized: true },
        {
          name: "url",
          type: "text",
          validate: (value: unknown) =>
            !value || (typeof value === "string" && /^(https:\/\/|\/)/.test(value))
              ? true
              : "Use an https URL or a path.",
        },
      ],
    },
    { name: "terms", type: "richText", localized: true },
    { name: "coins", type: "text", hasMany: true },
    sitesField(),
    regionsField(),
    seoField(),
    createdByField(),
  ],
};
