import { NextRequest } from "next/server";
import { sign } from "../../../../../cms/src/hooks/signature";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const saved = { ...process.env };
const secret = "s".repeat(32);

async function load(env: Record<string, string> = { REVALIDATE_SECRET: secret }) {
  vi.resetModules();
  process.env = { ...saved, BACKEND_API_URL: "http://api", PUBLIC_SITE_URL: "http://blog", ...env };
  return (await import("./route")).POST;
}

function call(body: string, signature?: string) {
  return new NextRequest("http://blog/api/revalidate", {
    method: "POST",
    body,
    headers: signature ? { "x-signature": signature } : {},
  });
}

afterEach(() => {
  process.env = { ...saved };
  revalidateTag.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/revalidate", () => {
  it("expires the tags of a signed call at once", async () => {
    const POST = await load();
    const body = JSON.stringify({ tags: ["cms:articles", "cms:articles:a", "cms:articles"] });
    const response = await POST(call(body, sign(body, secret)));
    expect(response.status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([
      ["cms:articles", { expire: 0 }],
      ["cms:articles:a", { expire: 0 }],
    ]);
  });

  it("refuses an unsigned, wrongly signed, or old call", async () => {
    const POST = await load();
    const body = JSON.stringify({ tags: ["cms:articles"] });
    expect((await POST(call(body))).status).toBe(401);
    expect((await POST(call(body, sign(body, "x".repeat(32))))).status).toBe(401);
    expect((await POST(call(body, sign(body, secret, Date.now() - 600_000)))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses tags that are not the CMS's", async () => {
    const POST = await load();
    for (const tags of [["assets"], [], "cms:articles"]) {
      const body = JSON.stringify({ tags });
      expect((await POST(call(body, sign(body, secret)))).status).toBe(400);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("marks the tags in the shared cache first, and answers 503 when it cannot", async () => {
    const { resetSharedCache, sharedCache } = await import("@/lib/cache/shared");
    resetSharedCache();
    const markTags = vi.fn().mockRejectedValueOnce(new Error("redis down"));
    Object.assign(sharedCache(), { store: { available: true, markTags } });
    try {
      const POST = await load();
      const body = JSON.stringify({ tags: ["cms:articles", "cms:articles"] });
      expect((await POST(call(body, sign(body, secret)))).status).toBe(503);
      expect(revalidateTag).not.toHaveBeenCalled();
      // The CMS tries again.
      expect((await POST(call(body, sign(body, secret)))).status).toBe(200);
      expect(markTags).toHaveBeenLastCalledWith(["cms:articles"], expect.any(Number));
      expect(revalidateTag).toHaveBeenCalledWith("cms:articles", { expire: 0 });
    } finally {
      resetSharedCache();
    }
  });

  it("is off without a secret", async () => {
    const POST = await load({});
    const body = JSON.stringify({ tags: ["cms:articles"] });
    expect((await POST(call(body, sign(body, secret)))).status).toBe(404);
  });
});
