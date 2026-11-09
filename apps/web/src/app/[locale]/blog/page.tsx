import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { ArticleList, pageHref, pageParam } from "@/components/cms/ArticleList";
import { TYPE_LABELS } from "@/components/cms/ArticleCard";
import { editorialContext, maybeEditorialContext } from "@/components/cms/context";

import { cx } from "@/components/ui/cx";
import { ARTICLE_TYPES, listArticles, type ArticleType } from "@/lib/cms";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ page?: string | string[]; type?: string | string[] }>;

// Depends on ?page= and ?type=; the CMS answers it reads are still cached.
export const dynamic = "force-dynamic";

function typeParam(value: string | string[] | undefined): ArticleType | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return ARTICLE_TYPES.find((type) => type === v);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const ctx = maybeEditorialContext((await params).locale);
  if (!ctx) return {};
  const query = await searchParams;
  const filtered = pageParam(query.page) > 1 || !!typeParam(query.type);
  return pageMetadata({
    locale: ctx.locale,
    path: "blog",
    title: ctx.t("BLOG_TITLE"),
    description: ctx.t("BLOG_DESCRIPTION"),
    noindex: filtered,
  });
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const ctx = editorialContext((await params).locale);
  const { locale, t } = ctx;
  const query = await searchParams;
  const page = pageParam(query.page);
  const type = typeParam(query.type);
  const result = await listArticles(locale, { page, type });
  const base = `/${locale}/blog`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/blog`}
        label={t("BREADCRUMBS_LABEL")}
        items={[{ label: t("HOME_LINK"), href: `/${locale}` }, { label: t("BLOG_TITLE") }]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("BLOG_TITLE")}</h1>
        <p className="text-muted">{t("BLOG_DESCRIPTION")}</p>
      </header>
      <nav aria-label={t("BLOG_FILTER_LABEL")}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {[undefined, ...ARTICLE_TYPES].map((value) => (
            <li key={value ?? "all"}>
              <Link
                href={pageHref(base, 1, value ? { type: value } : {})}
                aria-current={value === type ? "page" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1",
                  value === type
                    ? "border-primary bg-primary text-primary-contrast"
                    : "border-border hover:border-primary",
                )}
              >
                {value ? t(TYPE_LABELS[value]) : t("BLOG_FILTER_ALL")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ArticleList
        result={result}
        locale={locale}
        order={ctx.order}
        mediaBase={ctx.mediaBase}
        href={(p) => pageHref(base, p, type ? { type } : {})}
      />
    </main>
  );
}
