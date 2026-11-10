import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinTable } from "@/components/coins/CoinTable";
import { EmptyState, Pagination } from "@/components/ui";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { marketData } from "@/lib/backend";
import { getConfig } from "@/lib/config";
import { coinRows } from "@/lib/market/load";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ cursor?: string | string[] }>;

const PAGE_SIZE = 50;

// The page depends on ?cursor=, so it renders per request; the backend
// answers it reads are still cached (lib/backend).
export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() ? v.trim().slice(0, 512) : undefined;
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
  return pageMetadata({
    locale,
    path: "coins/new",
    title: t("COINS_NEW_TITLE"),
    description: t("COINS_NEW_DESCRIPTION"),
    // Later pages are not indexed; the first page is.
    noindex: !!one((await searchParams).cursor),
  });
}

/** The assets the catalog collected most recently, newest first. */
export default async function NewestCoinsPage({
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
  const cursor = one((await searchParams).cursor);

  const page = await marketData
    .listAssets({ sort: "newest", cursor, limit: PAGE_SIZE })
    .catch(() => undefined);
  const rows = page ? await coinRows(page.items, region) : [];

  const base = `/${locale}/coins/new`;
  const nextHref = page?.next_cursor
    ? `${base}?${new URLSearchParams({ cursor: page.next_cursor })}`
    : undefined;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={base}
        label={t("BREADCRUMBS_LABEL")}
        items={[
          { label: t("HOME_LINK"), href: `/${locale}` },
          { label: t("NAV_COINS"), href: `/${locale}/coins` },
          { label: t("COINS_NEW_TITLE") },
        ]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("COINS_NEW_TITLE")}</h1>
        <p className="text-muted">{t("COINS_NEW_DESCRIPTION")}</p>
      </header>

      {page ? (
        <CoinTable
          locale={locale}
          caption={t("COINS_NEW_TITLE")}
          rows={rows}
          empty={t("COINS_NEW_EMPTY")}
          showAdded
        />
      ) : (
        <EmptyState title={t("COINS_UNAVAILABLE")} />
      )}

      <Pagination
        label={t("PAGINATION_LABEL")}
        previous={cursor ? { href: base, label: t("PAGINATION_FIRST") } : undefined}
        next={nextHref ? { href: nextHref, label: t("PAGINATION_NEXT") } : undefined}
      />
    </main>
  );
}
