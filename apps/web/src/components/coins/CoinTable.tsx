import Link from "next/link";
import { CoinLogo } from "@/components/coins/CoinLogo";
import { Badge, DataTable, EmptyState, PriceChange, type Column } from "@/components/ui";
import { formatDate, formatNumber, formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import type { Asset } from "@/lib/backend/schemas";
import { toNumber, type ReferencePrice } from "@/lib/market/price";

/** A row of a list of coins: the asset and its reference price, if any. */
export interface CoinRow {
  asset: Asset;
  price?: ReferencePrice;
}

export interface CoinTableProps {
  locale: Locale;
  caption: string;
  rows: CoinRow[];
  /** Shown when there are no rows. */
  empty: string;
  /**
   * Adds the date the catalog first collected each coin, in the locale's
   * calendar (Jalali on fa), for the list of the newest coins.
   */
  showAdded?: boolean;
}

/**
 * The table of coins that the top coins and the newest coins pages share:
 * rank, logo, name and symbol with the Unverified badge, price, 24h change,
 * and circulating supply.
 */
export function CoinTable({ locale, caption, rows, empty, showAdded = false }: CoinTableProps) {
  const t = createTranslator(locale);
  const columns: Column<CoinRow>[] = [
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
    ...(showAdded
      ? [
          {
            key: "added",
            header: t("COINS_COL_ADDED"),
            cell: (r: CoinRow) =>
              r.asset.created_at ? (
                <time dateTime={r.asset.created_at}>
                  {formatDate(locale, r.asset.created_at, { dateStyle: "medium" })}
                </time>
              ) : (
                "—"
              ),
          },
        ]
      : []),
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
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.asset.slug}
      empty={<EmptyState title={empty} />}
    />
  );
}
