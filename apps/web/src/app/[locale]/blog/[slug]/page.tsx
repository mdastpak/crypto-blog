import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TYPE_LABELS } from "@/components/cms/ArticleCard";
import { CoinCards } from "@/components/cms/CoinCards";
import { editorialContext, maybeEditorialContext } from "@/components/cms/context";
import { documentMetadata, isPreview } from "@/components/cms/document";
import { langAttributes, PreviewBanner, TranslationNotice } from "@/components/cms/Notices";
import { RichText } from "@/components/cms/RichText";
import { Badge, Breadcrumbs } from "@/components/ui";
import { formatDate } from "@/i18n/format";
import { getArticle, mediaUrl, pick, shown, text } from "@/lib/cms";
import { safeHref } from "@/components/cms/RichText";

type Params = Promise<{ locale: string; slug: string }>;

// Rendered on the first request, then cached; publishing in the CMS
// revalidates it at once, and it is refreshed at most every 5 minutes anyway.
export const revalidate = 300;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

const load = cache(async (slug: string, preview: boolean) =>
  /^[a-z0-9-]{1,120}$/.test(slug) ? getArticle(slug, preview) : undefined,
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const ctx = maybeEditorialContext(locale);
  if (!ctx) return {};
  const preview = await isPreview();
  const article = await load(slug, preview);
  const view = article && shown(article.title, ctx.locale, ctx.served);
  if (!article || !view) return {};
  return documentMetadata({
    path: `blog/${slug}`,
    view,
    title: text(article.seo.title, view.docOrder) ?? text(article.title, view.docOrder)!,
    description:
      text(article.seo.description, view.docOrder) ?? text(article.excerpt, view.docOrder),
    image: article.cover,
    preview,
  });
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const ctx = editorialContext(raw);
  const { locale, t } = ctx;
  const preview = await isPreview();
  const article = await load(slug, preview);
  const view = article && shown(article.title, locale, ctx.served);
  if (!article || !view) notFound();
  const { docLocale, docOrder } = view;

  const title = text(article.title, docOrder)!;
  const excerpt = pick(article.excerpt, docOrder);
  const body = pick(article.body, docOrder);
  const partial = [excerpt, body].some((f) => f && f.locale !== docLocale);
  const cover = mediaUrl(article.cover, "hero", ctx.mediaBase);
  const author = article.author;
  const category = article.categories[0];
  // Each note in the reader's language when it has one, newest first.
  const corrections = article.corrections
    .map((c) => ({ ...c, note: pick(c.note, ctx.order) }))
    .filter((c): c is typeof c & { note: NonNullable<typeof c.note> } => !!c.note)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      {preview && <PreviewBanner locale={locale} path={`/${locale}/blog/${slug}`} />}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <Breadcrumbs
          label={t("BREADCRUMBS_LABEL")}
          items={[
            { label: t("HOME_LINK"), href: `/${locale}` },
            { label: t("BLOG_TITLE"), href: `/${locale}/blog` },
            ...(category
              ? [
                  {
                    label: text(category.name, ctx.order) ?? category.slug,
                    href: `/${locale}/blog/categories/${category.slug}`,
                  },
                ]
              : []),
            { label: title },
          ]}
        />
        {(view.untranslated || partial) && (
          <TranslationNotice
            locale={locale}
            original={view.untranslated ? docLocale : (body ?? excerpt)!.locale}
            partial={!view.untranslated}
          />
        )}
        <article {...langAttributes(docLocale, locale)} className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            {/* The blog's own labels stay in the page's language. */}
            <div
              {...langAttributes(locale, docLocale)}
              className="flex flex-wrap items-center gap-2 text-sm text-muted"
            >
              <Badge tone="accent">{t(TYPE_LABELS[article.type])}</Badge>
              {article.autoPublished && <Badge tone="warning">{t("NEWS_AUTOMATED")}</Badge>}
              {article.publishedAt && (
                <time dateTime={article.publishedAt}>
                  {t("ARTICLE_PUBLISHED", { date: formatDate(locale, article.publishedAt) })}
                </time>
              )}
            </div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {excerpt && (
              <p {...langAttributes(excerpt.locale, docLocale)} className="text-lg text-muted">
                {excerpt.value}
              </p>
            )}
            {author && (
              <p {...langAttributes(locale, docLocale)} className="text-sm">
                <Link
                  href={`/${locale}/blog/authors/${author.slug}`}
                  className="hover:text-primary"
                >
                  {t("ARTICLE_BY", { name: text(author.name, ctx.order) ?? author.slug })}
                </Link>
              </p>
            )}
          </header>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- CMS media, sized by the CMS
            <img
              src={cover.src}
              width={cover.width}
              height={cover.height}
              alt={text(article.cover!.alt, docOrder) ?? ""}
              className="w-full rounded-card object-cover"
            />
          )}
          {body && (
            <div {...langAttributes(body.locale, docLocale)}>
              <RichText
                value={body.value}
                locale={locale}
                order={docOrder}
                mediaBase={ctx.mediaBase}
              />
            </div>
          )}
          {corrections.length > 0 && (
            <section
              aria-labelledby="updates"
              {...langAttributes(locale, docLocale)}
              className="flex flex-col gap-2 rounded-card border border-border p-4 text-sm"
            >
              <h2 id="updates" className="font-semibold">
                {t("ARTICLE_UPDATES")}
              </h2>
              <ul className="flex flex-col gap-2">
                {corrections.map((c) => (
                  <li key={`${c.at}:${c.kind}`}>
                    <strong>
                      {t(c.kind === "correction" ? "ARTICLE_CORRECTION" : "ARTICLE_UPDATE")}
                    </strong>{" "}
                    <time dateTime={c.at} className="text-muted">
                      {formatDate(locale, c.at, { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                    {": "}
                    <span {...langAttributes(c.note.locale, locale)}>{c.note.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {article.sources.length > 0 && (
            <section aria-labelledby="sources" className="flex flex-col gap-2 text-sm">
              <h2 id="sources" {...langAttributes(locale, docLocale)} className="font-semibold">
                {t("ARTICLE_SOURCES")}
              </h2>
              <ul className="list-disc ps-5">
                {article.sources.map((source) => {
                  const href = safeHref(source.url);
                  const label = source.title ? `${source.title} (${source.name})` : source.name;
                  return (
                    <li key={`${source.name}:${source.url}`}>
                      {href ? (
                        <a href={href} rel="noopener noreferrer nofollow" className="underline">
                          {label}
                        </a>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {article.generatedBy && (
            <p
              {...langAttributes(locale, docLocale)}
              role="note"
              className="rounded-card bg-surface-muted p-3 text-sm text-muted"
            >
              {t(article.autoPublished ? "NEWS_NOTE_AUTOMATED" : "NEWS_NOTE_REVIEWED")}
            </p>
          )}
        </article>
        {(article.categories.length > 0 || article.tags.length > 0) && (
          <footer className="flex flex-col gap-2 text-sm">
            {[
              { label: t("ARTICLE_CATEGORIES"), kind: "categories", items: article.categories },
              { label: t("ARTICLE_TAGS"), kind: "tags", items: article.tags },
            ]
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <nav key={group.kind} aria-label={group.label} className="flex flex-wrap gap-2">
                  <span className="text-muted">{group.label}:</span>
                  {group.items.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/${locale}/blog/${group.kind}/${item.slug}`}
                      className="hover:text-primary"
                    >
                      <Badge>{text(item.name, ctx.order) ?? item.slug}</Badge>
                    </Link>
                  ))}
                </nav>
              ))}
          </footer>
        )}
        {article.coins.length > 0 && (
          <CoinCards slugs={article.coins} locale={locale} title={t("ARTICLE_COINS")} />
        )}
      </main>
    </>
  );
}
