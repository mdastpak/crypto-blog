import { PageBreadcrumbs } from "@/components/seo/PageBreadcrumbs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CampaignDates } from "@/components/cms/CampaignDates";
import { CoinCards } from "@/components/cms/CoinCards";
import { editorialContext, maybeEditorialContext } from "@/components/cms/context";
import { documentMetadata, isPreview } from "@/components/cms/document";
import { langAttributes, PreviewBanner, TranslationNotice } from "@/components/cms/Notices";
import { RichText, safeHref } from "@/components/cms/RichText";
import { ButtonLink } from "@/components/ui";
import { campaignState, getCampaign, mediaUrl, pick, shown, text } from "@/lib/cms";

type Params = Promise<{ locale: string; slug: string }>;

// Cached like articles; a campaign's state (upcoming, running, ended) is as
// of the last render, at most a minute old.
export const revalidate = 60;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

const load = cache(async (slug: string, preview: boolean) =>
  /^[a-z0-9-]{1,120}$/.test(slug) ? getCampaign(slug, preview) : undefined,
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const ctx = maybeEditorialContext(locale);
  if (!ctx) return {};
  const preview = await isPreview();
  const campaign = await load(slug, preview);
  const view = campaign && shown(campaign.title, ctx.locale, ctx.served);
  if (!campaign || !view) return {};
  return documentMetadata({
    path: `campaigns/${slug}`,
    view,
    title: text(campaign.seo.title, view.docOrder) ?? text(campaign.title, view.docOrder)!,
    description:
      text(campaign.seo.description, view.docOrder) ?? text(campaign.summary, view.docOrder),
    image: campaign.cover,
    preview,
  });
}

export default async function CampaignPage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const ctx = editorialContext(raw);
  const { locale, t } = ctx;
  const preview = await isPreview();
  const campaign = await load(slug, preview);
  const view = campaign && shown(campaign.title, locale, ctx.served);
  if (!campaign || !view) notFound();
  const { docLocale, docOrder } = view;

  const title = text(campaign.title, docOrder)!;
  const summary = pick(campaign.summary, docOrder);
  const body = pick(campaign.body, docOrder);
  const terms = pick(campaign.terms, docOrder);
  const partial = [summary, body, terms].find((f) => f && f.locale !== docLocale);
  const ended = campaignState(campaign) === "ended";
  const ctaHref = safeHref(campaign.cta.url);
  const ctaLabel = text(campaign.cta.label, docOrder);
  const cover = mediaUrl(campaign.cover, "hero", ctx.mediaBase);

  return (
    <>
      {preview && <PreviewBanner locale={locale} path={`/${locale}/campaigns/${slug}`} />}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <PageBreadcrumbs
          current={`/${locale}/campaigns/${slug}`}
          label={t("BREADCRUMBS_LABEL")}
          items={[
            { label: t("HOME_LINK"), href: `/${locale}` },
            { label: t("CAMPAIGNS_TITLE"), href: `/${locale}/campaigns` },
            { label: title },
          ]}
        />
        {(view.untranslated || partial) && (
          <TranslationNotice
            locale={locale}
            original={view.untranslated ? docLocale : partial!.locale}
            partial={!view.untranslated}
          />
        )}
        {ended && (
          <p role="note" className="rounded-card border border-border p-3 text-sm text-muted">
            {t("CAMPAIGN_ENDED_NOTICE")}
          </p>
        )}
        <article {...langAttributes(docLocale, locale)} className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <div {...langAttributes(locale, docLocale)}>
              <CampaignDates campaign={campaign} locale={locale} />
            </div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {summary && (
              <p {...langAttributes(summary.locale, docLocale)} className="text-lg text-muted">
                {summary.value}
              </p>
            )}
          </header>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- CMS media, sized by the CMS
            <img
              src={cover.src}
              width={cover.width}
              height={cover.height}
              alt={text(campaign.cover!.alt, docOrder) ?? ""}
              className="w-full rounded-card object-cover"
            />
          )}
          {body && (
            <div {...langAttributes(body.locale, docLocale)}>
              <RichText
                value={body.value}
                locale={locale}
                order={docOrder}
                mediaBase={ctx.mediaBase}
              />
            </div>
          )}
          {!ended && ctaHref && ctaLabel && (
            <ButtonLink href={ctaHref} className="self-start">
              {/* Written in the CMS, in the document's language. */}
              {ctaLabel}
            </ButtonLink>
          )}
          {terms && (
            <section
              aria-labelledby="terms"
              {...langAttributes(terms.locale, docLocale)}
              className="flex flex-col gap-2 rounded-card border border-border p-4 text-sm"
            >
              <h2 id="terms" {...langAttributes(locale, terms.locale)} className="font-semibold">
                {t("CAMPAIGN_TERMS")}
              </h2>
              <RichText
                value={terms.value}
                locale={locale}
                order={docOrder}
                mediaBase={ctx.mediaBase}
              />
            </section>
          )}
        </article>
        {campaign.coins.length > 0 && (
          <CoinCards slugs={campaign.coins} locale={locale} title={t("ARTICLE_COINS")} />
        )}
      </main>
    </>
  );
}
