import { EmptyState, Pagination } from "@/components/ui";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import type { Article, Page } from "@/lib/cms";
import { ArticleCard } from "./ArticleCard";

/** A page of articles with previous and next links (`?page=`). */
export function ArticleList({
  result,
  locale,
  order,
  mediaBase,
  href,
}: {
  result: Page<Article>;
  locale: Locale;
  order: readonly Locale[];
  mediaBase?: string;
  /** The list's URL for a page number. */
  href: (page: number) => string;
}) {
  const t = createTranslator(locale);
  if (result.docs.length === 0) return <EmptyState title={t("BLOG_EMPTY")} />;
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.docs.map((article) => (
          <li key={article.id} className="relative">
            <ArticleCard article={article} locale={locale} order={order} mediaBase={mediaBase} />
          </li>
        ))}
      </ul>
      <Pagination
        label={t("PAGINATION_LABEL")}
        previous={
          result.page > 1
            ? { href: href(result.page - 1), label: t("PAGINATION_PREVIOUS") }
            : undefined
        }
        next={
          result.page < result.totalPages
            ? { href: href(result.page + 1), label: t("PAGINATION_NEXT") }
            : undefined
        }
      />
    </>
  );
}

/** A page number from `?page=`, 1 when missing or invalid. */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

/** A list URL with `?page=` only past the first page. */
export function pageHref(base: string, page: number, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
