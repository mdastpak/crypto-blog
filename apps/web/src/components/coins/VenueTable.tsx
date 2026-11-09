import { Badge, DataTable, PriceChange, type Column } from "@/components/ui";
import { formatNumber, formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import type { VenueQuote } from "@/lib/backend/schemas";
import { spreadFromMedian, toNumber } from "@/lib/market/price";

/** The price of an asset at each venue, best traded first. */
export function VenueTable({
  quotes,
  locale,
  caption,
}: {
  quotes: VenueQuote[];
  locale: Locale;
  caption: string;
}) {
  const t = createTranslator(locale);
  const rows = [...quotes].sort(
    (a, b) => (toNumber(b.volume_quote) ?? 0) - (toNumber(a.volume_quote) ?? 0),
  );
  const columns: Column<VenueQuote>[] = [
    {
      key: "venue",
      header: t("COIN_VENUE_COL_VENUE"),
      cell: (q) => (
        <span className="flex items-center gap-2">
          {q.venue_name ?? q.venue}
          {q.stale && <Badge tone="warning">{t("COIN_VENUE_STALE")}</Badge>}
          {q.outlier && <Badge tone="danger">{t("COIN_VENUE_OUTLIER")}</Badge>}
        </span>
      ),
    },
    { key: "pair", header: t("COIN_VENUE_COL_PAIR"), cell: (q) => <bdi>{q.pair}</bdi> },
    {
      key: "price",
      header: t("COIN_VENUE_COL_PRICE"),
      numeric: true,
      cell: (q) => <bdi>{formatPrice(locale, toNumber(q.last) ?? 0, q.quote)}</bdi>,
    },
    {
      key: "spread",
      header: t("COIN_VENUE_COL_SPREAD"),
      numeric: true,
      hideOnMobile: true,
      cell: (q) => {
        const spread = spreadFromMedian(q);
        return spread === undefined ? "—" : <PriceChange locale={locale} ratio={spread} />;
      },
    },
    {
      key: "volume",
      header: t("COIN_VENUE_COL_VOLUME"),
      numeric: true,
      hideOnMobile: true,
      cell: (q) => {
        const volume = toNumber(q.volume_quote);
        return volume === undefined ? (
          "—"
        ) : (
          <bdi>
            {formatNumber(locale, volume, { notation: "compact", maximumFractionDigits: 1 })}{" "}
            {q.quote}
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
      rowKey={(q) => `${q.venue}:${q.pair}`}
    />
  );
}
