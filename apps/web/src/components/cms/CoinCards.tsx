import Link from "next/link";
import { CoinLogo } from "@/components/coins/CoinLogo";
import { Card, PriceChange } from "@/components/ui";
import { formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import { marketData } from "@/lib/backend";
import { getConfig } from "@/lib/config";
import { mapSettled } from "@/lib/market/concurrency";
import { referencePrice } from "@/lib/market/price";

const MAX_COINS = 6;

/**
 * Small live cards of the coins a CMS document is about, with the price as
 * of the page's last refresh. A coin the catalog does not know is left out,
 * and the cards never fail the page.
 */
export async function CoinCards({
  slugs,
  locale,
  title,
}: {
  slugs: string[];
  locale: Locale;
  title: string;
}) {
  const { region } = getConfig();
  const t = createTranslator(locale);
  const coins = await mapSettled([...new Set(slugs)].slice(0, MAX_COINS), 4, async (slug) => {
    const asset = await marketData.getAsset(slug);
    const venues = await marketData.getVenues(slug).catch(() => undefined);
    return { asset, price: venues ? referencePrice(venues.quotes, region) : undefined };
  });
  const found = coins.filter((c) => c !== undefined);
  if (found.length === 0) return null;
  return (
    <section aria-labelledby="coins" className="flex flex-col gap-3">
      <h2 id="coins" className="text-lg font-semibold">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {found.map(({ asset, price }) => (
          <li key={asset.slug} className="relative">
            <Card className="flex items-center gap-3">
              <CoinLogo src={asset.logo_url} symbol={asset.symbol} size={32} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/${locale}/coins/${asset.slug}`}
                  className="truncate font-medium after:absolute after:inset-0 hover:text-primary"
                  aria-label={t("COIN_VIEW", { name: asset.name })}
                >
                  {asset.name} <span className="text-muted">{asset.symbol}</span>
                </Link>
                {price && (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="tabular" dir="ltr">
                      {formatPrice(locale, price.price, price.quote)}
                    </span>
                    {price.change !== undefined && (
                      <PriceChange locale={locale} ratio={price.change} />
                    )}
                  </span>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
