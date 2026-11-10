import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinTable } from "@/components/coins/CoinTable";
import { Button, EmptyState, Pagination } from "@/components/ui";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { marketData } from "@/lib/backend";
import { getConfig } from "@/lib/config";
import { coinRows } from "@/lib/market/load";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ q?: string | string[]; cursor?: string | string[] }>;

const PAGE_SIZE = 50;

// The page depends on ?q= and ?cursor=, so it renders per request; the
// backend answers it reads are still cached (lib/backend).
export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() ? v.trim().slice(0, 100) : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const locale = enabledLocale((await params).locale);
  if (!locale) return {};
  const t = createTranslator(locale);
  const query = await searchParams;
  return pageMetadata({
    locale,
    path: "coins",
    title: t("COINS_TITLE"),
    description: t("COINS_DESCRIPTION"),
    // Search results and later pages are not indexed; the first page is.
    noindex: !!(one(query.q) || one(query.cursor)),
  });
}

export default async function CoinsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const locale = enabledLocale((await params).locale);
  if (!locale) notFound();
  const t = createTranslator(locale);
  const { region } = getConfig();
  const query = await searchParams;
  const q = one(query.q);
  const cursor = one(query.cursor);

  const page = await marketData.listAssets({ q, cursor, limit: PAGE_SIZE }).catch(() => undefined);
  const rows = page ? await coinRows(page.items, region) : [];

  const base = `/${locale}/coins`;
  const nextHref = page?.next_cursor
    ? `${base}?${new URLSearchParams({ ...(q ? { q } : {}), cursor: page.next_cursor })}`
    : undefined;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/coins`}
        label={t("BREADCRUMBS_LABEL")}
        items={[{ label: t("HOME_LINK"), href: `/${locale}` }, { label: t("NAV_COINS") }]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("COINS_TITLE")}</h1>
        <p className="text-muted">{t("COINS_DESCRIPTION")}</p>
        <Link href={`${base}/new`} className="text-primary hover:underline">
          {t("COINS_NEW_LINK")}
        </Link>
      </header>

      <form role="search" action={base} className="flex max-w-md gap-2">
        <label htmlFor="coin-search" className="sr-only">
          {t("COINS_SEARCH_LABEL")}
        </label>
        <input
          id="coin-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("COINS_SEARCH_PLACEHOLDER")}
          maxLength={100}
          className="h-10 flex-1 rounded-lg border border-border bg-background px-3"
        />
        <Button type="submit" variant="secondary">
          {t("COINS_SEARCH_SUBMIT")}
        </Button>
      </form>

      {page ? (
        <CoinTable
          locale={locale}
          caption={t("COINS_TITLE")}
          rows={rows}
          empty={t("COINS_EMPTY")}
        />
      ) : (
        <EmptyState title={t("COINS_UNAVAILABLE")} />
      )}

      <Pagination
        label={t("PAGINATION_LABEL")}
        previous={
          cursor
            ? {
                href: q ? `${base}?${new URLSearchParams({ q })}` : base,
                label: t("PAGINATION_FIRST"),
              }
            : undefined
        }
        next={nextHref ? { href: nextHref, label: t("PAGINATION_NEXT") } : undefined}
      />
    </main>
  );
}
