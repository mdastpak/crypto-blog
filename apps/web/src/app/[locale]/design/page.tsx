import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Pagination,
  PriceChange,
  Skeleton,
  Sparkline,
  type Column,
} from "@/components/ui";
import { contrastRatio } from "@/design/color";
import { getBrand, resolvePalette } from "@/design/brands";
import { COLOR_TOKENS, CONTRAST_PAIRS } from "@/design/tokens";
import { formatPrice } from "@/i18n/format";
import { enabledLocale } from "@/i18n/server";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

interface SampleRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  trend: number[];
}

const ROWS: SampleRow[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 64250.5,
    change: 0.0213,
    trend: [3, 4, 3.5, 5, 6, 5.8, 7],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 3120.1,
    change: -0.0145,
    trend: [7, 6, 6.5, 5, 4, 4.2, 3],
  },
  { symbol: "USDT", name: "Tether", price: 1, change: 0, trend: [5, 5, 5, 5, 5, 5, 5] },
];

/**
 * Every component in the release's brand, for designers and reviewers. It is
 * served only with DESIGN_GALLERY=true and never indexed. Switch the theme
 * and the locale in the header to see each combination.
 */
export default async function DesignPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = enabledLocale((await params).locale);
  const config = getConfig();
  if (!locale || !config.designGallery) notFound();
  const brand = getBrand(config.brand);

  const columns: Column<SampleRow>[] = [
    { key: "name", header: "Name", cell: (r) => `${r.name} (${r.symbol})` },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (r) => formatPrice(locale, r.price, "USD"),
    },
    {
      key: "change",
      header: "24h",
      numeric: true,
      cell: (r) => <PriceChange locale={locale} ratio={r.change} />,
    },
    {
      key: "trend",
      header: "7d",
      hideOnMobile: true,
      cell: (r) => <Sparkline values={r.trend} label={`${r.name}, 7 days`} />,
    },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold">Design system</h1>
        <p className="mt-2 text-muted">
          Brand <code>{brand.id}</code>, market colors <code>{brand.marketColors}</code>.
        </p>
      </header>

      <section aria-labelledby="palette">
        <h2 id="palette" className="mb-4 text-xl font-semibold">
          Palette
        </h2>
        {(["light", "dark"] as const).map((theme) => {
          const palette = resolvePalette(brand, theme);
          return (
            <div key={theme} className="mb-6">
              <h3 className="mb-2 font-medium">{theme}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {COLOR_TOKENS.map((token) => (
                  <li key={token} className="text-xs">
                    <span
                      className="block h-10 rounded border border-border"
                      style={{ background: palette[token] }}
                    />
                    <span className="mt-1 block font-mono">{token}</span>
                    <span className="block font-mono text-muted" dir="ltr">
                      {palette[token]}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {CONTRAST_PAIRS.map(([fg, bg, min]) => {
                  const ratio = contrastRatio(palette[fg], palette[bg]);
                  return (
                    <li key={`${fg}-${bg}`} className="font-mono" dir="ltr">
                      {fg} / {bg}: {ratio.toFixed(2)} {ratio >= min ? "✓" : "✗"} (min {min})
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="actions" className="flex flex-col gap-4">
        <h2 id="actions" className="text-xl font-semibold">
          Buttons and badges
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href={`/${locale}`} variant="secondary">
            Link
          </ButtonLink>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["neutral", "accent", "success", "danger", "warning", "info"] as const).map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </section>

      <section aria-labelledby="data" className="flex flex-col gap-4">
        <h2 id="data" className="text-xl font-semibold">
          Data
        </h2>
        <Breadcrumbs
          label="Breadcrumbs"
          items={[
            { label: "Home", href: `/${locale}` },
            { label: "Coins", href: `/${locale}` },
            { label: "Bitcoin" },
          ]}
        />
        <DataTable caption="Sample coins" columns={columns} rows={ROWS} rowKey={(r) => r.symbol} />
        <Pagination
          label="Pages"
          previous={{ href: `/${locale}/design`, label: "Previous" }}
          next={{ href: `/${locale}/design`, label: "Next" }}
        />
      </section>

      <section aria-labelledby="states" className="grid gap-4 sm:grid-cols-2">
        <h2 id="states" className="text-xl font-semibold sm:col-span-2">
          Cards and states
        </h2>
        <Card>
          <p className="font-medium">Card</p>
          <p className="mt-1 text-sm text-muted">Muted text on a surface.</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
        <EmptyState title="Nothing here yet">Empty states explain what will appear.</EmptyState>
      </section>
    </main>
  );
}
