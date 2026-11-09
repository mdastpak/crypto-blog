import { XMLParser } from "fast-xml-parser";

/** An entry as the feed gives it, before normalization. */
export interface RawEntry {
  title?: string;
  link?: string;
  guid?: string;
  summary?: string;
  content?: string;
  published?: string;
  image?: string;
  author?: string;
}

export interface ParsedFeed {
  format: "rss" | "atom" | "rdf";
  title?: string;
  entries: RawEntry[];
}

const ARRAYS = new Set([
  "item",
  "entry",
  "link",
  "category",
  "media:content",
  "media:thumbnail",
  "enclosure",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;

/** The text of a node: a string, `#text`, or a CDATA section. */
function textOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === "object") {
    const v = value as Node;
    return textOf(v["#text"] ?? v["__cdata"]);
  }
  return undefined;
}

function attr(value: unknown, name: string): string | undefined {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (item && typeof item === "object") {
      const v = (item as Node)[`@${name}`];
      if (typeof v === "string" && v) return v;
    }
  }
  return undefined;
}

function imageOf(item: Node): string | undefined {
  const enclosures = (item.enclosure as Node[] | undefined) ?? [];
  const image = enclosures.find((e) => String(e["@type"] ?? "").startsWith("image/"));
  return (
    attr(image, "url") ??
    attr(item["media:content"], "url") ??
    attr(item["media:thumbnail"], "url") ??
    undefined
  );
}

function rssEntry(item: Node): RawEntry {
  return {
    title: textOf(item.title),
    link: textOf(item.link) ?? attr(item.link, "href"),
    guid: textOf(item.guid),
    summary: textOf(item.description),
    content: textOf(item["content:encoded"]),
    published: textOf(item.pubDate) ?? textOf(item["dc:date"]),
    image: imageOf(item),
    author: textOf(item["dc:creator"]) ?? textOf(item.author),
  };
}

function atomLink(links: unknown): string | undefined {
  const list = (Array.isArray(links) ? links : [links]) as Node[];
  const alternate =
    list.find((l) => l && (l["@rel"] === undefined || l["@rel"] === "alternate")) ?? list[0];
  return alternate ? (attr(alternate, "href") ?? textOf(alternate)) : undefined;
}

function atomEntry(entry: Node): RawEntry {
  const author = entry.author as Node | Node[] | undefined;
  return {
    title: textOf(entry.title),
    link: atomLink(entry.link),
    guid: textOf(entry.id),
    summary: textOf(entry.summary),
    content: textOf(entry.content),
    published: textOf(entry.published) ?? textOf(entry.updated),
    image: imageOf(entry),
    author: textOf(Array.isArray(author) ? author[0]?.name : author?.name),
  };
}

/**
 * Parses RSS 2.0, RSS 1.0 (RDF), and Atom. A DOCTYPE is removed first, so
 * a feed cannot declare entities (no entity expansion attacks).
 */
export function parseFeed(xml: string): ParsedFeed {
  const cleaned = xml.replace(/^\uFEFF/, "").replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "");
  const doc = parser.parse(cleaned) as Node;
  const rss = doc.rss as Node | undefined;
  if (rss?.channel) {
    const channel = (Array.isArray(rss.channel) ? rss.channel[0] : rss.channel) as Node;
    return {
      format: "rss",
      title: textOf(channel.title),
      entries: ((channel.item as Node[] | undefined) ?? []).map(rssEntry),
    };
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    return {
      format: "atom",
      title: textOf(feed.title),
      entries: ((feed.entry as Node[] | undefined) ?? []).map(atomEntry),
    };
  }
  const rdf = doc["rdf:RDF"] as Node | undefined;
  if (rdf) {
    return {
      format: "rdf",
      title: textOf((rdf.channel as Node | undefined)?.title),
      entries: ((rdf.item as Node[] | undefined) ?? []).map(rssEntry),
    };
  }
  throw new Error("not an RSS or Atom feed");
}
