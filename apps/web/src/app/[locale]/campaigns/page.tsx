import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { pageHref, pageParam } from "@/components/cms/ArticleList";
import { CampaignDates } from "@/components/cms/CampaignDates";
import { editorialContext, maybeEditorialContext } from "@/components/cms/context";
import { Card, EmptyState, Pagination } from "@/components/ui";
import { listCampaigns, mediaUrl, text } from "@/lib/cms";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ page?: string | string[] }>;

// Depends on ?page=, and on the time (a campaign's state); CMS answers are cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const ctx = maybeEditorialContext((await params).locale);
  if (!ctx) return {};
  return pageMetadata({
    locale: ctx.locale,
    path: "campaigns",
    title: ctx.t("CAMPAIGNS_TITLE"),
    description: ctx.t("CAMPAIGNS_DESCRIPTION"),
    noindex: pageParam((await searchParams).page) > 1,
  });
}

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const ctx = editorialContext((await params).locale);
  const { locale, t } = ctx;
  const page = pageParam((await searchParams).page);
  const result = await listCampaigns(locale, { page });
  const base = `/${locale}/campaigns`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PageBreadcrumbs
        current={`/${locale}/campaigns`}
        label={t("BREADCRUMBS_LABEL")}
        items={[{ label: t("HOME_LINK"), href: `/${locale}` }, { label: t("CAMPAIGNS_TITLE") }]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("CAMPAIGNS_TITLE")}</h1>
        <p className="text-muted">{t("CAMPAIGNS_DESCRIPTION")}</p>
      </header>
      {result.docs.length === 0 ? (
        <EmptyState title={t("CAMPAIGNS_EMPTY")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {result.docs.map((campaign) => {
            const cover = mediaUrl(campaign.cover, "card", ctx.mediaBase);
            const summary = text(campaign.summary, [locale]);
            return (
              <li key={campaign.id} className="relative">
                <Card className="flex h-full flex-col gap-3 p-0">
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- CMS media, sized by the CMS
                    <img
                      src={cover.src}
                      width={cover.width}
                      height={cover.height}
                      alt=""
                      loading="lazy"
                      className="aspect-[16/9] w-full rounded-t-card object-cover"
                    />
                  )}
                  <div className="flex flex-col gap-2 px-4 pb-4 first:pt-4">
                    <CampaignDates campaign={campaign} locale={locale} />
                    <h2 className="text-lg font-semibold">
                      <Link
                        href={`${base}/${campaign.slug}`}
                        className="after:absolute after:inset-0 hover:text-primary"
                      >
                        {text(campaign.title, [locale])}
                      </Link>
                    </h2>
                    {summary && <p className="text-sm text-muted">{summary}</p>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        label={t("PAGINATION_LABEL")}
        previous={
          page > 1 ? { href: pageHref(base, page - 1), label: t("PAGINATION_PREVIOUS") } : undefined
        }
        next={
          page < result.totalPages
            ? { href: pageHref(base, page + 1), label: t("PAGINATION_NEXT") }
            : undefined
        }
      />
    </main>
  );
}
