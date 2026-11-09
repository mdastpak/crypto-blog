import type { Locale } from "./config.ts";
import {
  bulletList,
  directionOf,
  heading,
  link,
  paragraph,
  root,
  text,
  type LexicalRoot,
} from "./lexical.ts";

/** One report of a story, as stored by the collector. */
export interface StoryItem {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  publishedAt: Date;
  region: "ir" | "global";
}

/** A story (a cluster of reports), in the language its reports are in. */
export interface Story {
  id: string;
  language: Locale;
  title: string;
  coins: string[];
  firstSeenAt: Date;
  /** Oldest first. */
  items: StoryItem[];
}

export interface Draft {
  language: Locale;
  title: string;
  summary: string;
  body: LexicalRoot;
  coins: string[];
  sources: { name: string; url: string; title: string }[];
}

/**
 * Writes an original draft of a story in one language. The template writer
 * does it without AI now; an LLM writer can take its place behind config.
 * Whatever writes, a draft never copies source text beyond headlines (short
 * quotes), and links every source.
 */
export interface Writer {
  /** Stored on the CMS document (generatedBy); the page shows an editorial note. */
  readonly id: string;
  /** Drafts in every configured language; otherwise only in the story's own. */
  readonly translates: boolean;
  write(story: Story, language: Locale): Promise<Draft>;
}

/** One entry per source: its first report of the story. */
export function distinctSources(story: Story): StoryItem[] {
  const seen = new Set<string>();
  return story.items.filter((item) => !seen.has(item.sourceId) && seen.add(item.sourceId));
}

const PHRASES = {
  en: {
    and: " and ",
    comma: ", ",
    summary: (n: string, names: string) => `${n} sources report this story, including ${names}.`,
    intro: (date: string, n: string) =>
      `This story was first reported on ${date} and has been covered by ${n} sources so far. ` +
      "Their reports are listed below; follow the links for the full coverage.",
    coverage: "Coverage",
  },
  fa: {
    and: " و ",
    comma: "، ",
    summary: (n: string, names: string) => `${n} منبع این خبر را گزارش کرده‌اند، از جمله ${names}.`,
    intro: (date: string, n: string) =>
      `این خبر نخستین بار در ${date} منتشر شد و تاکنون ${n} منبع آن را پوشش داده‌اند. ` +
      "گزارش‌ها در ادامه آمده‌اند؛ برای جزئیات کامل، پیوند هر منبع را باز کنید.",
    coverage: "پوشش خبری",
  },
} as const;

function list(names: string[], p: (typeof PHRASES)[Locale]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(p.comma)}${p.and}${names.at(-1)}`;
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/**
 * A roundup in the story's own language: the first headline, a summary
 * naming the sources, and every report linked under it. It does not
 * translate, so it drafts only in the story's language.
 */
export class TemplateWriter implements Writer {
  readonly id = "template";
  readonly translates = false;

  async write(story: Story, language: Locale): Promise<Draft> {
    if (language !== story.language) {
      throw new Error(`the template writer does not translate (${story.language} to ${language})`);
    }
    const p = PHRASES[language];
    const dir = directionOf(language);
    const sources = distinctSources(story);
    const count = new Intl.NumberFormat(language).format(sources.length);
    const date = new Intl.DateTimeFormat(language, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: language === "fa" ? "Asia/Tehran" : "UTC",
    }).format(story.items[0]?.publishedAt ?? story.firstSeenAt);
    const named = sources.slice(0, 3).map((s) => s.sourceName);

    return {
      language,
      title: truncate(story.title, 200),
      summary: truncate(p.summary(count, list(named, p)), 300),
      body: root(dir, [
        paragraph(dir, [text(p.intro(date, count))]),
        heading(dir, "h2", p.coverage),
        bulletList(
          dir,
          sources.map((s) => [link(dir, s.url, s.title), text(` — ${s.sourceName}`)]),
        ),
      ]),
      coins: story.coins,
      sources: sources.map((s) => ({ name: s.sourceName, url: s.url, title: s.title })),
    };
  }
}

export function createWriter(kind: "template"): Writer {
  switch (kind) {
    case "template":
      return new TemplateWriter();
  }
}
