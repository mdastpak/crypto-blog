import { Badge, type BadgeTone } from "@/components/ui";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator, type MessageKey } from "@/i18n/translate";
import { campaignState, type Campaign } from "@/lib/cms";

const STATE: Record<ReturnType<typeof campaignState>, { key: MessageKey; tone: BadgeTone }> = {
  upcoming: { key: "CAMPAIGN_UPCOMING", tone: "info" },
  running: { key: "CAMPAIGN_RUNNING", tone: "success" },
  ended: { key: "CAMPAIGN_ENDED", tone: "neutral" },
};

/** A campaign's state badge and dates. */
export function CampaignDates({
  campaign,
  locale,
  now,
}: {
  campaign: Pick<Campaign, "startsAt" | "endsAt">;
  locale: Locale;
  now?: number;
}) {
  const t = createTranslator(locale);
  const state = STATE[campaignState(campaign, now)];
  const start = formatDate(locale, campaign.startsAt, { dateStyle: "medium" });
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <Badge tone={state.tone}>{t(state.key)}</Badge>
      <span>
        {campaign.endsAt
          ? t("CAMPAIGN_DATES", {
              start,
              end: formatDate(locale, campaign.endsAt, { dateStyle: "medium" }),
            })
          : t("CAMPAIGN_FROM", { start })}
      </span>
    </span>
  );
}
