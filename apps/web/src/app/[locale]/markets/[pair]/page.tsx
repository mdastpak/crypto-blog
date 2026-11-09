import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CoinLogo } from "@/components/coins/CoinLogo";
import { VenueTable } from "@/components/coins/VenueTable";
import { ButtonLink, Card, PriceChange } from "@/components/ui";
import { formatDate, formatNumber, formatPrice } from "@/i18n/format";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { getConfig } from "@/lib/config";
import { listedCurrency, pricesFor } from "@/lib/market/load";
import { currencyName, marketPath, marketQuotes, parseMarket } from "@/lib/market/markets";
import { priceIn, visibleQuotes } from "@/lib/market/price";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ locale: string; pair: string }>;

// Rendered on the first request, then refreshed at most every 30 seconds.
export const revalidate = 30;

export function generateStaticParams(): { pair: string }[] {
  return [];
}

/**
 * The market of a path segment, or undefined: the quote must be one this
 * release shows (no IRT abroad), and the base a listed, non-fiat currency.
 */
const loadMarket = cache(async (segment: string) => {
  const parsed = parseMarket(segment);
  const { region, marketQuotes: configured } = getConfig();
  const quotes = marketQuotes(configured, region);
  if (!parsed || parsed.base === parsed.quote || !quotes.includes(parsed.quote)) return undefined;
  const currency = await listedCurrency(parsed.base);
  if (!currency || currency.info.if_fiat) return undefined;
  return { ...parsed, currency, quotes };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw, pair } = await params;
  const locale = enabledLocale(raw);
  const market = locale && (await loadMarket(pair));
  if (!locale || !market) return {};
  const t = createTranslator(locale);
  return pageMetadata({
    locale,
    path: `markets/${marketPath(market.base, market.quote)}`,
    title: t("MARKET_TITLE", { base: market.base, quote: market.quote }),
    description: t("MARKET_DESCRIPTION", {
      name: currencyName(market.currency, locale),
      quote: market.quote,
    }),
  });
}

export default async function MarketPage({ params }: { params: Params }) {
  const { locale: raw, pair } = await params;
  const locale = enabledLocale(raw);
  if (!locale) notFound();
  const market = await loadMarket(pair);
  if (!market) notFound();
  // The canonical path is lower case.
  if (pair !== marketPath(market.base, market.quote)) notFound();
  const t = createTranslator(locale);
  const { region, exchangeAppUrl } = getConfig();
  const { base, quote, currency } = market;
  const name = currencyName(currency, locale);

  const { asset, venues } = await pricesFor(base);
  const all = venues ? visibleQuotes(venues.quotes, region) : [];
  const rows = all.filter((q) => q.quote.toUpperCase() === quote);
  const price = venues ? priceIn(venues.quotes, quote, region) : undefined;
  const excluded = rows.some((q) => q.stale || q.outlier);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/markets/${pair}`}
        label={t("BREADCRUMBS_LABEL")}
        items={[
          { label: t("HOME_LINK"), href: `/${locale}` },
          { label: t("NAV_MARKETS"), href: `/${locale}/markets` },
          { label: `${base}/${quote}` },
        ]}
      />

      <header className="flex flex-wrap items-center gap-4">
        <CoinLogo src={currency.info.logo_url ?? asset?.logo_url} symbol={base} size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">
            <bdi>
              {base}/{quote}
            </bdi>
          </h1>
          <p className="text-muted">{name}</p>
        </div>
        {exchangeAppUrl && (
          <ButtonLink
            href={`${exchangeAppUrl}/trade/${encodeURIComponent(base)}?${new URLSearchParams({ quote })}`}
            className="ms-auto"
          >
            {t("MARKET_TRADE", { base, quote })}
          </ButtonLink>
        )}
      </header>

      <section aria-labelledby="price" className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <h2 id="price" className="text-sm text-muted">
            {t("MARKET_PRICE_LABEL", { quote })}
          </h2>
          {price ? (
            <>
              <p className="text-3xl font-bold tabular" dir="ltr">
                {formatPrice(locale, price.price, price.quote)}
              </p>
              {price.change !== undefined && <PriceChange locale={locale} ratio={price.change} />}
              <p className="text-xs text-muted">
                {t("COIN_PRICE_NOTE", {
                  count: formatNumber(locale, price.venues),
                  time: formatDate(locale, price.observedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </p>
            </>
          ) : (
            <p className="text-muted">{t("MARKET_NO_PRICE", { quote })}</p>
          )}
        </Card>
        <nav
          aria-label={t("MARKET_OTHER_QUOTES", { base })}
          className="flex flex-col gap-2 lg:col-span-2"
        >
          <ul className="flex flex-wrap gap-2 text-sm">
            {market.quotes
              .filter((q) => q !== quote && q !== base)
              .map((q) => (
                <li key={q}>
                  <Link
                    href={`/${locale}/markets/${marketPath(base, q)}`}
                    className="rounded-lg border border-border px-3 py-1 hover:bg-surface-muted"
                  >
                    <bdi>
                      {base}/{q}
                    </bdi>
                  </Link>
                </li>
              ))}
            {asset && (
              <li>
                <Link
                  href={`/${locale}/coins/${asset.slug}`}
                  className="rounded-lg border border-border px-3 py-1 hover:bg-surface-muted"
                >
                  {t("MARKET_COIN_LINK", { name })}
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="venues" className="flex flex-col gap-3">
          <h2 id="venues" className="text-xl font-semibold">
            {t("COIN_VENUES_TITLE")}
          </h2>
          <VenueTable
            quotes={rows}
            locale={locale}
            caption={t("MARKET_VENUES_CAPTION", { base, quote })}
          />
          {excluded && <p className="text-xs text-muted">{t("MARKET_EXCLUDED_NOTE")}</p>}
        </section>
      )}
    </main>
  );
}
