import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator, type MessageKey } from "@/i18n/translate";
import { mediaUrl, text, type Article } from "@/lib/cms";

export const TYPE_LABELS: Record<Article["type"], MessageKey> = {
  article: "ARTICLE_TYPE_ARTICLE",
  guide: "ARTICLE_TYPE_GUIDE",
  analysis: "ARTICLE_TYPE_ANALYSIS",
  news: "ARTICLE_TYPE_NEWS",
};

/**
 * An article in a list. Lists hold only articles translated into `locale`,
 * so the card's own texts never fall back; related names (author) may.
 */
export function ArticleCard({
  article,
  locale,
  order,
  mediaBase,
}: {
  article: Article;
  locale: Locale;
  order: readonly Locale[];
  mediaBase?: string;
}) {
  const t = createTranslator(locale);
  const title = text(article.title, [locale]) ?? "";
  const excerpt = text(article.excerpt, [locale]);
  const cover = mediaUrl(article.cover, "card", mediaBase);
  const author = article.author ? text(article.author.name, order) : undefined;
  return (
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
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 first:pt-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge tone="accent">{t(TYPE_LABELS[article.type])}</Badge>
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {formatDate(locale, article.publishedAt, { dateStyle: "medium" })}
            </time>
          )}
        </div>
        <h2 className="text-lg font-semibold leading-snug">
          <Link
            href={`/${locale}/blog/${article.slug}`}
            className="after:absolute after:inset-0 hover:text-primary"
          >
            {title}
          </Link>
        </h2>
        {excerpt && <p className="line-clamp-3 text-sm text-muted">{excerpt}</p>}
        {author && (
          <p className="mt-auto text-xs text-muted">{t("ARTICLE_BY", { name: author })}</p>
        )}
      </div>
    </Card>
  );
}
