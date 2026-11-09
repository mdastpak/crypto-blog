import type { Locale } from "@/i18n/locales";
import { cmsEnabled, fallbackOrder, listArticles } from "@/lib/cms";
import { getConfig } from "@/lib/config";
import { ArticleCard } from "./ArticleCard";
import { logger } from "@/lib/log";

/**
 * The latest articles about a coin, for its page. Nothing when the release
 * has no CMS, there are none, or the CMS cannot answer: the coin page never
 * fails because of it.
 */
export async function RelatedArticles({
  coin,
  locale,
  title,
}: {
  coin: string;
  locale: Locale;
  title: string;
}) {
  if (!cmsEnabled()) return null;
  const { locales, cmsMediaUrl } = getConfig();
  const result = await listArticles(locale, { coin, limit: 3 }).catch((error: unknown) => {
    logger.warn("related articles unavailable", { coin, error });
    return undefined;
  });
  if (!result?.docs.length) return null;
  const order = fallbackOrder(locale, locales);
  return (
    <section aria-labelledby="related" className="flex flex-col gap-3">
      <h2 id="related" className="text-xl font-semibold">
        {title}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.docs.map((article) => (
          <li key={article.id} className="relative">
            <ArticleCard article={article} locale={locale} order={order} mediaBase={cmsMediaUrl} />
          </li>
        ))}
      </ul>
    </section>
  );
}
