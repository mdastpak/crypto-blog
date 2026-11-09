import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinLogo } from "@/components/coins/CoinLogo";
import { DataTable, EmptyState, PriceChange, type Column } from "@/components/ui";
import { formatNumber, formatPrice } from "@/i18n/format";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { getConfig } from "@/lib/config";
import { mapSettled } from "@/lib/market/concurrency";
import { listedCurrencies, pricesFor } from "@/lib/market/load";
import {
  currencyName,
  marketPath,
  marketQuotes,
  marketsOf,
  type Market,
} from "@/lib/market/markets";
import { priceIn, type ReferencePrice } from "@/lib/market/price";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ locale: string }>;

// Rendered on the first request, then refreshed in the background at most
// every minute; the prices it reads are cached for 30 seconds.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = enabledLocale((await params).locale);
  if (!locale) return {};
  const t = createTranslator(locale);
  return pageMetadata({
    locale,
    path: "markets",
    title: t("MARKETS_TITLE"),
    description: t("MARKETS_DESCRIPTION"),
  });
}

interface Row {
  market: Market;
  logo?: string;
  price?: ReferencePrice;
}

export default async function MarketsPage({ params }: { params: Params }) {
  const locale = enabledLocale((await params).locale);
  if (!locale) notFound();
  const t = createTranslator(locale);
  const { region, marketQuotes: configured } = getConfig();
  const quotes = marketQuotes(configured, region);

  const currencies = await listedCurrencies().catch(() => undefined);
  const markets = currencies ? marketsOf(currencies, quotes) : [];
  // One catalog lookup per currency, a few at a time; its venues price every
  // quote of it. A failed lookup shows dashes.
  const bases = [...new Set(markets.map((m) => m.base))];
  const prices = await mapSettled(bases, 8, (symbol) => pricesFor(symbol));
  const bySymbol = new Map(bases.map((symbol, i) => [symbol, prices[i]]));
  const rows: Row[] = markets.map((market) => {
    const found = bySymbol.get(market.base);
    return {
      market,
      logo: market.currency.info.logo_url ?? found?.asset?.logo_url,
      price: found?.venues ? priceIn(found.venues.quotes, market.quote, region) : undefined,
    };
  });

  const columns: Column<Row>[] = [
    {
      key: "pair",
      header: t("MARKETS_COL_PAIR"),
      cell: (r) => (
        <Link
          href={`/${locale}/markets/${marketPath(r.market.base, r.market.quote)}`}
          className="flex items-center gap-2 hover:underline"
        >
          <CoinLogo src={r.logo} symbol={r.market.base} size={24} />
          <bdi className="font-medium">
            {r.market.base}/{r.market.quote}
          </bdi>
          <span className="text-muted">{currencyName(r.market.currency, locale)}</span>
        </Link>
      ),
    },
    {
      key: "price",
      header: t("MARKETS_COL_PRICE"),
      numeric: true,
      cell: (r) => (r.price ? <bdi>{formatPrice(locale, r.price.price, r.price.quote)}</bdi> : "—"),
    },
    {
      key: "change",
      header: t("MARKETS_COL_CHANGE"),
      numeric: true,
      cell: (r) =>
        r.price?.change !== undefined ? (
          <PriceChange locale={locale} ratio={r.price.change} />
        ) : (
          "—"
        ),
    },
    {
      key: "venues",
      header: t("MARKETS_COL_VENUES"),
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (r.price ? formatNumber(locale, r.price.venues) : "—"),
    },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/markets`}
        label={t("BREADCRUMBS_LABEL")}
        items={[{ label: t("HOME_LINK"), href: `/${locale}` }, { label: t("NAV_MARKETS") }]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("MARKETS_TITLE")}</h1>
        <p className="text-muted">{t("MARKETS_DESCRIPTION")}</p>
      </header>
      {currencies ? (
        <DataTable
          caption={t("MARKETS_TITLE")}
          columns={columns}
          rows={rows}
          rowKey={(r) => marketPath(r.market.base, r.market.quote)}
          empty={<EmptyState title={t("MARKETS_EMPTY")} />}
        />
      ) : (
        <EmptyState title={t("MARKETS_UNAVAILABLE")} />
      )}
    </main>
  );
}
