import { describe, expect, it } from "vitest";
import { plainText } from "./lexical.ts";
import { reviewDecision } from "./policy.ts";
import { TemplateWriter, type Story } from "./writer.ts";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 10, minutes));

export const story = (overrides: Partial<Story> = {}): Story => ({
  id: "7",
  language: "en",
  title: "Bitcoin climbs above $120,000 as ETF inflows grow",
  coins: ["bitcoin"],
  firstSeenAt: at(0),
  items: [
    {
      sourceId: "wire",
      sourceName: "Wire",
      url: "https://wire.example/btc",
      title: "Bitcoin climbs above $120,000 as ETF inflows grow",
      publishedAt: at(0),
      region: "global",
    },
    {
      sourceId: "daily",
      sourceName: "Daily <Crypto>",
      url: "https://daily.example/a",
      title: "BTC tops $120K on ETF demand",
      publishedAt: at(5),
      region: "global",
    },
    {
      sourceId: "wire",
      sourceName: "Wire",
      url: "https://wire.example/btc-update",
      title: "Bitcoin extends gains",
      publishedAt: at(9),
      region: "global",
    },
  ],
  ...overrides,
});

describe("template writer", () => {
  const writer = new TemplateWriter();

  it("writes a roundup that links every source once and copies only headlines", async () => {
    const draft = await writer.write(story(), "en");
    expect(draft.title).toBe("Bitcoin climbs above $120,000 as ETF inflows grow");
    expect(draft.summary).toBe("2 sources report this story, including Wire and Daily <Crypto>.");
    expect(draft.sources).toEqual([
      { name: "Wire", url: "https://wire.example/btc", title: story().items[0]!.title },
      {
        name: "Daily <Crypto>",
        url: "https://daily.example/a",
        title: "BTC tops $120K on ETF demand",
      },
    ]);
    expect(draft.coins).toEqual(["bitcoin"]);
    const body = plainText(draft.body);
    expect(body).toContain("November 9, 2026");
    expect(body).toContain("BTC tops $120K on ETF demand — Daily <Crypto>");
    expect(draft.body.root.direction).toBe("ltr");
    const links = JSON.stringify(draft.body).match(/"url":"[^"]+"/g);
    expect(links).toEqual(['"url":"https://wire.example/btc"', '"url":"https://daily.example/a"']);
  });

  it("writes Persian right to left with Persian digits", async () => {
    const fa = story({
      language: "fa",
      title: "بیت‌کوین از ۱۲۰ هزار دلار گذشت",
      items: story().items.map((i) => ({ ...i, title: "بیت‌کوین بالا رفت" })),
    });
    const draft = await writer.write(fa, "fa");
    expect(draft.summary).toBe("۲ منبع این خبر را گزارش کرده‌اند، از جمله Wire و Daily <Crypto>.");
    expect(draft.body.root.direction).toBe("rtl");
    expect(plainText(draft.body)).toContain("پوشش خبری");
  });

  it("does not translate", async () => {
    expect(writer.translates).toBe(false);
    await expect(writer.write(story(), "fa")).rejects.toThrow(/does not translate/);
  });

  it("shortens a long headline", async () => {
    const draft = await writer.write(story({ title: "x".repeat(300) }), "en");
    expect(draft.title).toHaveLength(200);
    expect(draft.title.endsWith("…")).toBe(true);
  });
});

describe("review policy", () => {
  it("waits for an editor by default", () => {
    expect(reviewDecision(story(), { autoPublishMinSources: 0 })).toEqual({
      publish: false,
      reason: "review required",
    });
  });

  it("publishes when enough distinct sources report it, if allowed", () => {
    expect(reviewDecision(story(), { autoPublishMinSources: 3 }).publish).toBe(false);
    expect(reviewDecision(story(), { autoPublishMinSources: 2 })).toEqual({
      publish: true,
      reason: "2 sources",
    });
  });
});
