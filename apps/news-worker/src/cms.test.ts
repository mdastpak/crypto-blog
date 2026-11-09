import { describe, expect, it, vi } from "vitest";
import { CmsClient, CmsError, type FetchLike } from "./cms.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("CMS client", () => {
  it("finds a story's article with the API key, drafts included", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      json(200, { docs: [{ id: 5, _status: "draft", title: { en: "Hi", fa: null } }] }),
    );
    const cms = new CmsClient("https://cms.internal", "k".repeat(20), fetch);
    expect(await cms.findByExternalId("story-1-2")).toEqual({
      id: "5",
      _status: "draft",
      title: { en: "Hi", fa: null },
    });
    const [url, init] = fetch.mock.calls[0]!;
    const u = new URL(url);
    expect(u.pathname).toBe("/api/articles");
    expect(u.searchParams.get("where[externalId][equals]")).toBe("story-1-2");
    expect(u.searchParams.get("draft")).toBe("true");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `users API-Key ${"k".repeat(20)}`,
    );
  });

  it("creates a draft, or a published article when the policy allows", async () => {
    const fetch = vi.fn<FetchLike>(async () => json(201, { doc: { id: 9 } }));
    const cms = new CmsClient("https://cms.internal", "k".repeat(20), fetch);
    const data = {
      type: "news" as const,
      title: "t",
      excerpt: "e",
      body: {},
      coins: [],
      sources: [],
      generatedBy: "template",
      regions: [],
    };
    await cms.create(data, "en", false);
    await cms.create(data, "en", true);
    const [draftUrl, draftInit] = fetch.mock.calls[0]!;
    expect(new URL(draftUrl).searchParams.get("draft")).toBe("true");
    expect(JSON.parse(draftInit.body as string)._status).toBe("draft");
    const [pubUrl, pubInit] = fetch.mock.calls[1]!;
    expect(new URL(pubUrl).searchParams.has("draft")).toBe(false);
    expect(JSON.parse(pubInit.body as string)._status).toBe("published");
  });

  it("reports errors with their status, and which are worth retrying", async () => {
    const failing = (status: number) =>
      new CmsClient("https://cms.internal", "k".repeat(20), async () =>
        json(status, { errors: [{ message: "Value must be unique" }] }),
      );
    const error = (await failing(400)
      .findByExternalId("x")
      .catch((e: unknown) => e)) as CmsError;
    expect(error.message).toContain("Value must be unique");
    expect(error.retryable).toBe(false);
    expect(
      (
        (await failing(503)
          .findByExternalId("x")
          .catch((e: unknown) => e)) as CmsError
      ).retryable,
    ).toBe(true);
    const down = new CmsClient("https://cms.internal", "k".repeat(20), async () => {
      throw new TypeError("fetch failed");
    });
    await expect(down.findByExternalId("x")).rejects.toMatchObject({ status: 0, retryable: true });
  });
});
