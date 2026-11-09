import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinLogo } from "@/components/coins/CoinLogo";
import { PriceChart, type ChartPoint } from "@/components/coins/PriceChart";
import { VenueTable } from "@/components/coins/VenueTable";
import { Badge, Breadcrumbs, ButtonLink, Card, PriceChange } from "@/components/ui";
import { formatDate, formatNumber, formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { isNotFound, marketData, type Asset } from "@/lib/backend";
import { getConfig } from "@/lib/config";
import { referencePrice, toNumber, visibleQuotes } from "@/lib/market/price";

type Params = Promise<{ locale: string; slug: string }>;

// Rendered on the first request, then served from the cache and refreshed
// in the background at most every 30 seconds.
export const revalidate = 30;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

async function loadAsset(slug: string): Promise<Asset> {
  try {
    return await marketData.getAsset(slug);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = enabledLocale(raw);
  if (!locale) return {};
  const asset = await loadAsset(slug);
  const t = createTranslator(locale);
  return {
    title: t("COIN_TITLE", { name: asset.name, symbol: asset.symbol }),
    description: t("COIN_DESCRIPTION", { name: asset.name, symbol: asset.symbol }),
  };
}

export default async function CoinPage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const locale = enabledLocale(raw);
  if (!locale) notFound();
  const t = createTranslator(locale);
  const { region, exchangeAppUrl } = getConfig();

  const asset = await loadAsset(slug);
  // Prices and the chart are optional: the page still renders without them.
  const venues = await marketData.getVenues(slug).catch(() => undefined);
  const quotes = venues ? visibleQuotes(venues.quotes, region) : [];
  const price = venues ? referencePrice(venues.quotes, region) : undefined;
  const chart = price
    ? await marketData
        .getCandles(slug, { venue: price.chartVenue, quote: price.quote, interval: "1d" })
        .catch(() => undefined)
    : undefined;
  const points: ChartPoint[] = (chart?.candles ?? []).flatMap((c) => {
    const close = toNumber(c.c);
    return close === undefined ? [] : [{ time: c.t, close }];
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <Breadcrumbs
        label={t("BREADCRUMBS_LABEL")}
        items={[
          { label: t("HOME_LINK"), href: `/${locale}` },
          { label: t("NAV_COINS"), href: `/${locale}/coins` },
          { label: asset.name },
        ]}
      />

      <header className="flex flex-wrap items-center gap-4">
        <CoinLogo src={asset.logo_url} symbol={asset.symbol} size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">
            {asset.name} <span className="text-muted">{asset.symbol}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {asset.market_cap_rank && (
              <Badge>{t("COIN_RANK", { rank: formatNumber(locale, asset.market_cap_rank) })}</Badge>
            )}
            {asset.verified ? (
              <Badge tone="success">{t("COIN_LISTED")}</Badge>
            ) : (
              <Badge tone="warning">{t("COIN_UNVERIFIED")}</Badge>
            )}
          </div>
        </div>
        {asset.verified && exchangeAppUrl && (
          <ButtonLink
            href={`${exchangeAppUrl}/trade/${encodeURIComponent(asset.symbol)}`}
            className="ms-auto"
          >
            {t("COIN_TRADE", { symbol: asset.symbol })}
          </ButtonLink>
        )}
      </header>

      {!asset.verified && (
        <p role="note" className="rounded-card border border-warning/40 p-3 text-sm">
          {t("COIN_UNVERIFIED_NOTE")}
        </p>
      )}

      <section aria-labelledby="price" className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <h2 id="price" className="text-sm text-muted">
            {price
              ? t("COIN_PRICE_LABEL", { quote: price.quote })
              : t("COIN_PRICE_LABEL", { quote: "USDT" })}
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
            <p className="text-muted">{t("COIN_NO_PRICE")}</p>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">{t("COIN_CHART_TITLE")}</h2>
          {price && points.length > 1 ? (
            <PriceChart
              points={points}
              quote={price.quote}
              locale={locale}
              label={t("COIN_CHART_LABEL", {
                name: asset.name,
                quote: price.quote,
                venue: price.chartVenue,
              })}
            />
          ) : (
            <p className="text-sm text-muted">{t("COIN_CHART_EMPTY")}</p>
          )}
        </Card>
      </section>

      {quotes.length > 0 && (
        <section aria-labelledby="venues" className="flex flex-col gap-3">
          <h2 id="venues" className="text-xl font-semibold">
            {t("COIN_VENUES_TITLE")}
          </h2>
          <VenueTable
            quotes={quotes}
            locale={locale}
            caption={t("COIN_VENUES_CAPTION", { name: asset.name })}
          />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {asset.description && (
          <section aria-labelledby="about" className="lg:col-span-2">
            <h2 id="about" className="mb-2 text-xl font-semibold">
              {t("COIN_ABOUT_TITLE", { name: asset.name })}
            </h2>
            {/* Plain text from the catalog; the source's language, shown left to right when Latin. */}
            <p dir="auto" className="whitespace-pre-line leading-7 text-muted">
              {asset.description}
            </p>
          </section>
        )}
        <aside className="flex flex-col gap-4">
          <Supply asset={asset} locale={locale} />
          <Links asset={asset} title={t("COIN_LINKS_TITLE")} />
          {asset.contracts && asset.contracts.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">{t("COIN_CONTRACTS_TITLE")}</h2>
              <dl className="flex flex-col gap-2 text-sm">
                {asset.contracts.map((c) => (
                  <div key={`${c.network}:${c.address}`}>
                    <dt className="text-muted">{c.network}</dt>
                    <dd dir="ltr" className="font-mono text-xs break-all">
                      {c.address}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </aside>
      </div>

      {asset.attribution && (
        <p className="text-xs text-muted">{t("COIN_SOURCE", { source: asset.attribution })}</p>
      )}
    </main>
  );
}

function Supply({ asset, locale }: { asset: Asset; locale: Locale }) {
  const t = createTranslator(locale);
  const rows = [
    [t("COIN_SUPPLY_CIRCULATING"), asset.circulating_supply],
    [t("COIN_SUPPLY_TOTAL"), asset.total_supply],
    [t("COIN_SUPPLY_MAX"), asset.max_supply],
  ].flatMap(([label, value]) => {
    const n = toNumber(value);
    return n === undefined ? [] : [[label!, n] as const];
  });
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{t("COIN_SUPPLY_TITLE")}</h2>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular">
              {formatNumber(locale, value, { maximumFractionDigits: 0 })} {asset.symbol}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Links({ asset, title }: { asset: Asset; title: string }) {
  const links = Object.entries(asset.links ?? {}).filter(([, url]) => url.startsWith("https://"));
  if (links.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {links.map(([kind, url]) => (
          <li key={kind}>
            <a
              href={url}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="text-primary hover:underline"
            >
              {kind}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
