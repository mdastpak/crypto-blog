import { NextRequest } from "next/server";
import { previewUrl } from "../../../../../cms/src/hooks/signature";

const enable = vi.fn();
const disable = vi.fn();
vi.mock("next/headers", () => ({ draftMode: async () => ({ enable, disable, isEnabled: false }) }));

const saved = { ...process.env };
const secret = "s".repeat(32);

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  process.env = {
    ...saved,
    BACKEND_API_URL: "http://api",
    PUBLIC_SITE_URL: "http://blog",
    CMS_API_URL: "http://cms/api",
    REVALIDATE_SECRET: secret,
    CMS_PREVIEW_API_KEY: "k".repeat(36),
    ...env,
  };
  return { GET: (await import("./route")).GET, exit: (await import("./exit/route")).GET };
}

afterEach(() => {
  process.env = { ...saved };
  enable.mockReset();
  disable.mockReset();
});

const link = (target: { collection: string; slug: string; locale: string }) =>
  new NextRequest(previewUrl("http://blog", target, secret));

describe("preview", () => {
  it("turns on draft mode for a signed link and opens the document", async () => {
    const { GET } = await load();
    const response = await GET(link({ collection: "articles", slug: "a", locale: "en" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/en/blog/a");
    expect(enable).toHaveBeenCalledOnce();

    const campaign = await GET(link({ collection: "campaigns", slug: "c", locale: "fa" }));
    expect(campaign.headers.get("location")).toBe("/fa/campaigns/c");
  });

  it("refuses a tampered link, an unknown collection, or a locale not served", async () => {
    const { GET } = await load({ LOCALES: "fa" });
    const tampered = new URL(
      previewUrl("http://blog", { collection: "articles", slug: "a", locale: "fa" }, secret),
    );
    tampered.searchParams.set("slug", "b");
    expect((await GET(new NextRequest(tampered))).status).toBe(401);
    expect((await GET(link({ collection: "users", slug: "a", locale: "fa" }))).status).toBe(401);
    expect((await GET(link({ collection: "articles", slug: "a", locale: "en" }))).status).toBe(401);
    expect(enable).not.toHaveBeenCalled();
  });

  it("is off without the preview key", async () => {
    const { GET } = await load({ CMS_PREVIEW_API_KEY: "" });
    expect((await GET(link({ collection: "articles", slug: "a", locale: "en" }))).status).toBe(401);
  });

  it("leaves draft mode, back to a path of this site only", async () => {
    const { exit } = await load();
    const back = await exit(new NextRequest("http://blog/api/preview/exit?to=/en/blog/a"));
    expect(back.headers.get("location")).toBe("/en/blog/a");
    const away = await exit(new NextRequest("http://blog/api/preview/exit?to=//evil.example"));
    expect(away.headers.get("location")).toBe("/");
    expect(disable).toHaveBeenCalledTimes(2);
  });
});
