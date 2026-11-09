import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { mediaUrl, text } from "@/lib/cms";
import { mediaSchema, type RichText as RichTextValue } from "@/lib/cms/schemas";

/**
 * Renders a Lexical document from the CMS as plain HTML elements. Only the
 * nodes below are rendered; anything else shows its text children or
 * nothing. There is no raw HTML: the CMS cannot inject markup or script, and
 * links keep to http(s), mailto, and paths of this site.
 */

interface Node {
  type?: string;
  tag?: string;
  listType?: string;
  text?: string;
  format?: number | string;
  url?: string;
  fields?: { url?: string; newTab?: boolean; linkType?: string; doc?: unknown };
  value?: unknown;
  children?: unknown[];
}

interface Context {
  locale: Locale;
  order: readonly Locale[];
  mediaBase?: string;
}

// Lexical's text format bits.
const BOLD = 1;
const ITALIC = 2;
const STRIKE = 4;
const UNDERLINE = 8;
const CODE = 16;
const SUBSCRIPT = 32;
const SUPERSCRIPT = 64;

/** A link target the blog renders; anything else becomes plain text. */
export function safeHref(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  if (value.startsWith("#")) return value;
  return undefined;
}

function internalHref(doc: unknown, locale: Locale): string | undefined {
  const d = doc as { relationTo?: string; value?: { slug?: unknown } } | undefined;
  const slug = d?.value?.slug;
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  if (d?.relationTo === "articles") return `/${locale}/blog/${slug}`;
  if (d?.relationTo === "campaigns") return `/${locale}/campaigns/${slug}`;
  return undefined;
}

function renderText(node: Node, key: number): ReactNode {
  let out: ReactNode = node.text ?? "";
  const format = typeof node.format === "number" ? node.format : 0;
  if (format & CODE) out = <code>{out}</code>;
  if (format & BOLD) out = <strong>{out}</strong>;
  if (format & ITALIC) out = <em>{out}</em>;
  if (format & UNDERLINE) out = <u>{out}</u>;
  if (format & STRIKE) out = <s>{out}</s>;
  if (format & SUBSCRIPT) out = <sub>{out}</sub>;
  if (format & SUPERSCRIPT) out = <sup>{out}</sup>;
  return <span key={key}>{out}</span>;
}

function children(node: Node, ctx: Context): ReactNode[] {
  return (node.children ?? []).map((child, i) => renderNode(child as Node, ctx, i));
}

function renderNode(node: Node, ctx: Context, key: number): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "linebreak":
      return <br key={key} />;
    case "tab":
      return "\t";
    case "paragraph":
      return <p key={key}>{children(node, ctx)}</p>;
    case "heading": {
      // The page title is the h1; the body starts at h2.
      const level = Math.min(Math.max(Number(node.tag?.slice(1)) || 2, 2), 6);
      const Tag = `h${level}` as "h2";
      return <Tag key={key}>{children(node, ctx)}</Tag>;
    }
    case "quote":
      return <blockquote key={key}>{children(node, ctx)}</blockquote>;
    case "list": {
      const Tag = node.listType === "number" ? "ol" : "ul";
      return <Tag key={key}>{children(node, ctx)}</Tag>;
    }
    case "listitem":
      return <li key={key}>{children(node, ctx)}</li>;
    case "horizontalrule":
      return <hr key={key} />;
    case "link":
    case "autolink": {
      const href =
        node.fields?.linkType === "internal"
          ? internalHref(node.fields.doc, ctx.locale)
          : safeHref(node.fields?.url ?? node.url);
      if (!href) return <span key={key}>{children(node, ctx)}</span>;
      const external = /^https?:/i.test(href);
      return (
        <a
          key={key}
          href={href}
          {...(external ? { rel: "noopener noreferrer nofollow" } : {})}
          {...(node.fields?.newTab ? { target: "_blank" } : {})}
        >
          {children(node, ctx)}
        </a>
      );
    }
    case "upload": {
      const media = mediaSchema.safeParse(node.value);
      if (!media.success) return null;
      const image = mediaUrl(media.data, "hero", ctx.mediaBase);
      if (!image) return null;
      return (
        <figure key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS media, sized by the CMS */}
          <img
            src={image.src}
            width={image.width}
            height={image.height}
            alt={text(media.data.alt, ctx.order) ?? ""}
            loading="lazy"
          />
        </figure>
      );
    }
    default:
      return node.children ? <span key={key}>{children(node, ctx)}</span> : null;
  }
}

export interface RichTextProps extends Context {
  value: RichTextValue;
  className?: string;
}

export function RichText({ value, className, ...ctx }: RichTextProps) {
  return (
    <div className={["cms-prose", className].filter(Boolean).join(" ")}>
      {(value.root.children as Node[]).map((node, i) => renderNode(node, ctx, i))}
    </div>
  );
}
