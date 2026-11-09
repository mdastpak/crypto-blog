import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinLogo } from "@/components/coins/CoinLogo";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Pagination,
  PriceChange,
  type Column,
} from "@/components/ui";
import { formatNumber, formatPrice } from "@/i18n/format";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { marketData, type Asset } from "@/lib/backend";
import { getConfig } from "@/lib/config";
import { mapSettled } from "@/lib/market/concurrency";
import { referencePrice, toNumber, type ReferencePrice } from "@/lib/market/price";
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

interface Row {
  asset: Asset;
  price?: ReferencePrice;
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
  // The list has no prices: each row's comes from its venues, cached for 30
  // seconds, a few calls at a time. A failed one shows a dash.
  const prices = page
    ? await mapSettled(page.items, 8, async (asset) =>
        referencePrice((await marketData.getVenues(asset.slug)).quotes, region),
      )
    : [];
  const rows: Row[] = (page?.items ?? []).map((asset, i) => ({ asset, price: prices[i] }));

  const columns: Column<Row>[] = [
    {
      key: "rank",
      header: t("COINS_COL_RANK"),
      cell: (r) => (r.asset.market_cap_rank ? formatNumber(locale, r.asset.market_cap_rank) : "—"),
    },
    {
      key: "name",
      header: t("COINS_COL_NAME"),
      cell: (r) => (
        <Link
          href={`/${locale}/coins/${r.asset.slug}`}
          className="flex items-center gap-2 hover:underline"
        >
          <CoinLogo src={r.asset.logo_url} symbol={r.asset.symbol} size={24} />
          <span className="font-medium">{r.asset.name}</span>
          <span className="text-muted">{r.asset.symbol}</span>
          {!r.asset.verified && <Badge tone="warning">{t("COIN_UNVERIFIED")}</Badge>}
        </Link>
      ),
    },
    {
      key: "price",
      header: t("COINS_COL_PRICE"),
      numeric: true,
      cell: (r) => (r.price ? <bdi>{formatPrice(locale, r.price.price, r.price.quote)}</bdi> : "—"),
    },
    {
      key: "change",
      header: t("COINS_COL_CHANGE"),
      numeric: true,
      cell: (r) =>
        r.price?.change !== undefined ? (
          <PriceChange locale={locale} ratio={r.price.change} />
        ) : (
          "—"
        ),
    },
    {
      key: "supply",
      header: t("COINS_COL_SUPPLY"),
      numeric: true,
      hideOnMobile: true,
      cell: (r) => {
        const supply = toNumber(r.asset.circulating_supply);
        return supply === undefined ? (
          "—"
        ) : (
          <bdi>
            {formatNumber(locale, supply, { notation: "compact", maximumFractionDigits: 2 })}{" "}
            {r.asset.symbol}
          </bdi>
        );
      },
    },
  ];

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
        <DataTable
          caption={t("COINS_TITLE")}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.asset.slug}
          empty={<EmptyState title={t("COINS_EMPTY")} />}
        />
      ) : (
        <EmptyState title={t("COINS_UNAVAILABLE")} />
      )}

      <Pagination
        label={t("PAGINATION_LABEL")}
        previous={
          cursor
            ? { href: q ? `${base}?${new URLSearchParams({ q })}` : base, label: t("HOME_LINK") }
            : undefined
        }
        next={nextHref ? { href: nextHref, label: t("PAGINATION_NEXT") } : undefined}
      />
    </main>
  );
}
