import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  assetSchema,
  backendLocaleSchema,
  candleSchema,
  chartSchema,
  contractSchema,
  currencySchema,
  feedItemSchema,
  localesInfoSchema,
  alternateSchema,
  siteInfoSchema,
  siteSchema,
  statusSchema,
  venueComparisonSchema,
  venueQuoteSchema,
} from "./schemas";

interface Property {
  type?: string;
  $ref?: string;
  allOf?: unknown[];
  items?: unknown;
}

const spec = JSON.parse(
  readFileSync(join(process.cwd(), "contracts/backend-openapi.json"), "utf8"),
) as { definitions: Record<string, { properties?: Record<string, Property> }> };

/** Our schema and the backend definition it reads. */
const PAIRS: [string, z.ZodObject][] = [
  ["marketdata.AssetView", assetSchema],
  ["marketdata.Contract", contractSchema],
  ["marketdata.VenueComparison", venueComparisonSchema],
  ["marketdata.VenueQuote", venueQuoteSchema],
  ["marketdata.Chart", chartSchema],
  ["marketdata.CandlePoint", candleSchema],
  ["marketdata.FeedItem", feedItemSchema],
  ["models.Currency", currencySchema],
  ["public.LocalesInfo", localesInfoSchema],
  ["i18n.Locale", backendLocaleSchema],
  ["platform.Status", statusSchema],
  ["public.SiteInfo", siteInfoSchema],
  ["sites.Site", siteSchema],
  ["sites.Alternate", alternateSchema],
];

function baseType(schema: z.ZodType): string {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodPipe) {
      // A value checked or cleaned after it is read, such as logo_url.
      current = current.in as z.ZodType;
    } else {
      break;
    }
  }
  return current.def.type;
}

/** Whether a field of our schema can read a property of the OpenAPI document. */
function compatible(ours: string, theirs: Property): boolean {
  if (theirs.$ref || theirs.allOf) return ours === "object";
  switch (theirs.type) {
    case "string":
      return ours === "string" || ours === "enum";
    case "integer":
    case "number":
      return ours === "number";
    case "boolean":
      return ours === "boolean";
    case "array":
      return ours === "array";
    case "object":
      return ours === "object" || ours === "record";
    default:
      return true;
  }
}

describe.each(PAIRS)("%s", (name, schema) => {
  const definition = spec.definitions[name];

  it("exists in the backend's OpenAPI snapshot", () => {
    expect(definition?.properties).toBeDefined();
  });

  it.each(Object.entries(schema.shape))(
    "field %s exists with a compatible type",
    (field, fieldSchema) => {
      const property = definition?.properties?.[field];
      expect(property, `${name}.${field} is not in the backend's schema`).toBeDefined();
      const ours = baseType(fieldSchema as z.ZodType);
      expect(
        compatible(ours, property!),
        `${name}.${field}: ours ${ours}, theirs ${JSON.stringify(property)}`,
      ).toBe(true);
    },
  );
});
