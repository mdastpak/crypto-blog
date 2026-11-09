import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/jsonld";

/** A JSON-LD script; its content is escaped so it cannot break out of the tag. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
