import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { notFound } from "next/navigation";

import type { MessageKey } from "@/i18n/translate";
import {
  getAuthor,
  getCategory,
  getTag,
  listArticles,
  text,
  type ArticleFilter,
  type Author,
  type Taxonomy,
} from "@/lib/cms";
import { ArticleList, pageHref, pageParam } from "./ArticleList";
import { editorialContext, maybeEditorialContext } from "./context";

/** The article lists of a category, a tag, or an author. */
export type ListingKind = "categories" | "tags" | "authors";

const KINDS: Record<
  ListingKind,
  {
    title: MessageKey;
    load: (slug: string) => Promise<Taxonomy | Author | undefined>;
    filter: (id: Taxonomy["id"]) => ArticleFilter;
  }
> = {
  categories: { title: "CATEGORY_TITLE", load: getCategory, filter: (id) => ({ categoryId: id }) },
  tags: { title: "TAG_TITLE", load: getTag, filter: (id) => ({ tagId: id }) },
  authors: { title: "AUTHOR_TITLE", load: getAuthor, filter: (id) => ({ authorId: id }) },
};

export type ListingProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function description(doc: Taxonomy | Author): Taxonomy["description"] {
  return "bio" in doc ? doc.bio : doc.description;
}

export async function listingMetadata(kind: ListingKind, props: ListingProps): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const ctx = maybeEditorialContext(locale);
  if (!ctx) return {};
  const doc = await KINDS[kind].load(slug);
  if (!doc) return {};
  const name = text(doc.name, ctx.order) ?? slug;
  return pageMetadata({
    locale: ctx.locale,
    path: `blog/${kind}/${slug}`,
    title: ctx.t(KINDS[kind].title, { name }),
    description: text(description(doc), ctx.order),
    noindex: pageParam((await props.searchParams).page) > 1,
  });
}

export async function Listing({ kind, ...props }: ListingProps & { kind: ListingKind }) {
  const { locale: raw, slug } = await props.params;
  const ctx = editorialContext(raw);
  const { locale, t } = ctx;
  const doc = await KINDS[kind].load(slug);
  if (!doc) notFound();
  const page = pageParam((await props.searchParams).page);
  const result = await listArticles(locale, { page, ...KINDS[kind].filter(doc.id) });
  const name = text(doc.name, ctx.order) ?? slug;
  const about = text(description(doc), ctx.order);
  const base = `/${locale}/blog/${kind}/${slug}`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/blog/${kind}/${slug}`}
        label={t("BREADCRUMBS_LABEL")}
        items={[
          { label: t("HOME_LINK"), href: `/${locale}` },
          { label: t("BLOG_TITLE"), href: `/${locale}/blog` },
          { label: name },
        ]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t(KINDS[kind].title, { name })}</h1>
        {about && <p className="text-muted">{about}</p>}
      </header>
      <ArticleList
        result={result}
        locale={locale}
        order={ctx.order}
        mediaBase={ctx.mediaBase}
        href={(p) => pageHref(base, p)}
      />
    </main>
  );
}
