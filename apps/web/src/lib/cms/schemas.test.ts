import articlePage from "./fixtures/article-page.json";
import campaignPage from "./fixtures/campaign-page.json";
import { articleSchema, campaignSchema, pageOf } from "./schemas";

// The fixtures are real answers of the CMS (apps/cms, seeded) to
// `?locale=all&depth=1`; a change to the CMS's collections that the blog
// cannot read fails here.
describe("CMS answers", () => {
  it("reads an article with its localized fields and relations", () => {
    const page = pageOf(articleSchema).parse(articlePage);
    const article = page.docs[0]!;
    expect(article).toMatchObject({
      slug: "weekly-market-review",
      type: "analysis",
      title: { fa: "مرور هفتگی بازار", en: "Weekly market review" },
      coins: ["bitcoin", "ethereum"],
    });
    expect(article.body.en).toBeNull();
    expect(article.author?.slug).toBe("newsroom");
    expect(article.categories.map((c) => c.slug)).toEqual(["market"]);
    expect(page.totalPages).toBe(1);
  });

  it("reads a campaign", () => {
    const campaign = pageOf(campaignSchema).parse(campaignPage).docs[0]!;
    expect(campaign.slug).toBe("welcome-campaign");
    expect(campaign.cta.label.en).toBe("Get started");
    expect(campaign.endsAt).toBeTruthy();
  });

  it("treats unpopulated relations as missing and an unknown type as an article", () => {
    const article = articleSchema.parse({
      id: 1,
      slug: "x",
      type: "podcast",
      title: { fa: "x" },
      author: 7,
      categories: [3, { id: 4, slug: "c", name: { fa: "c" } }],
      cover: null,
    });
    expect(article.type).toBe("article");
    expect(article.author).toBeUndefined();
    expect(article.categories.map((c) => c.slug)).toEqual(["c"]);
    expect(article.excerpt).toEqual({});
  });
});
