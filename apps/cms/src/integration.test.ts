/**
 * Runs Payload against a real PostgreSQL (TEST_DATABASE_URL, emptied first):
 * migrations, roles, publishing, localization, and the revalidation hook.
 * Skipped when TEST_DATABASE_URL is not set; CI sets it.
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("CMS with PostgreSQL", () => {
  let payload: Payload;
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
  const users: Record<string, { id: number; roles: string[]; collection: "users" }> = {};

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      PAYLOAD_SECRET: "integration-test-secret-0123456789abcdef",
      CMS_PUBLIC_URL: "http://localhost:3001",
      WEB_REVALIDATE_URLS: "https://web.test/api/revalidate",
      REVALIDATE_SECRET: "r".repeat(32),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getPayload } = await import("payload");
    const { default: config } = await import("@payload-config");
    const { migrations } = await import("./migrations");
    payload = await getPayload({ config });
    await payload.db.drizzle.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;" as never);
    await payload.db.migrate({ migrations: migrations as never });
    for (const role of ["admin", "editor", "reviewer", "author", "viewer", "newsbot"]) {
      const doc = await payload.create({
        collection: "users",
        data: {
          email: `${role}@test.example`,
          password: "a-long-password-1",
          name: role,
          roles: [role as "admin"],
        },
      });
      users[role] = { ...(doc as unknown as { id: number; roles: string[] }), collection: "users" };
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await payload?.destroy();
  });

  const asUser = (role: string) => ({ user: users[role] as never, overrideAccess: false });

  it("an author saves a draft but cannot publish it", async () => {
    const draft = await payload.create({
      collection: "articles",
      data: { title: "پیش‌نویس", slug: "draft-one", _status: "draft" },
      draft: true,
      locale: "fa",
      ...asUser("author"),
    });
    expect(draft._status).toBe("draft");
    await expect(
      payload.update({
        collection: "articles",
        id: draft.id,
        data: { _status: "published" },
        ...asUser("author"),
      }),
    ).rejects.toThrow(/Only editors and reviewers can publish/);
  });

  it("an author cannot edit another author's article", async () => {
    const other = await payload.create({
      collection: "articles",
      data: { title: "Editor's", slug: "editors-piece", _status: "draft" },
      draft: true,
      ...asUser("editor"),
    });
    await expect(
      payload.update({
        collection: "articles",
        id: other.id,
        data: { title: "Changed" },
        ...asUser("author"),
      }),
    ).rejects.toThrow();
  });

  it("a reviewer publishes, visitors see only published articles, and the web is revalidated", async () => {
    fetchMock.mockClear();
    const article = await payload.create({
      collection: "articles",
      data: { title: "سلام", slug: "hello", _status: "draft" },
      draft: true,
      locale: "fa",
      ...asUser("author"),
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await payload.update({
      collection: "articles",
      id: article.id,
      data: { _status: "published" },
      locale: "fa",
      ...asUser("reviewer"),
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://web.test/api/revalidate");
    expect(JSON.parse(init.body as string)).toEqual({
      tags: ["cms:articles", "cms:articles:hello"],
    });

    const visible = await payload.find({
      collection: "articles",
      overrideAccess: false,
      user: undefined,
    });
    expect(visible.docs.map((d) => d.slug)).toEqual(["hello"]);
    expect(visible.docs[0]!.publishedAt).toBeTruthy();
  });

  it("falls back to Persian for a missing English translation", async () => {
    const doc = await payload.find({
      collection: "articles",
      where: { slug: { equals: "hello" } },
      locale: "en",
    });
    expect(doc.docs[0]!.title).toBe("سلام");
  });

  it("refuses a campaign that ends before it starts, and a bad slug", async () => {
    await expect(
      payload.create({
        collection: "campaigns",
        data: {
          title: "x",
          slug: "c1",
          startsAt: "2026-11-10T00:00:00Z",
          endsAt: "2026-11-09T00:00:00Z",
        },
        ...asUser("editor"),
      }),
    ).rejects.toMatchObject({
      data: { errors: [{ path: "endsAt", message: "The end must be after the start." }] },
    });
    await expect(
      payload.create({
        collection: "categories",
        data: { name: "x", slug: "Not A Slug" },
        ...asUser("editor"),
      }),
    ).rejects.toThrow();
  });

  it("keeps the blog's own paths out of article slugs", async () => {
    await expect(
      payload.create({
        collection: "articles",
        data: { title: "x", slug: "categories", type: "article" },
        ...asUser("editor"),
      }),
    ).rejects.toMatchObject({ data: { errors: [{ path: "slug" }] } });
  });

  it("a viewer reads drafts but cannot write", async () => {
    const draft = await payload.create({
      collection: "articles",
      data: { title: "Draft for viewer", slug: "viewer-draft", type: "article" },
      draft: true,
      ...asUser("editor"),
    });
    const read = await payload.findByID({
      collection: "articles",
      id: draft.id,
      draft: true,
      ...asUser("viewer"),
    });
    expect(read.title).toBe("Draft for viewer");
    await expect(
      payload.update({
        collection: "articles",
        id: draft.id,
        data: { title: "changed" },
        ...asUser("viewer"),
      }),
    ).rejects.toThrow();
  });

  it("only admins change roles", async () => {
    const updated = await payload.update({
      collection: "users",
      id: users.author!.id,
      data: { roles: ["admin"] },
      ...asUser("author"),
    });
    expect(updated.roles).toEqual(["author"]);
  });

  it("the news worker writes labeled news drafts and publishes only auto-published ones", async () => {
    const generated = {
      type: "news" as const,
      generatedBy: "template",
      sources: [{ name: "Wire", url: "https://wire.example/a", title: "Bitcoin rises" }],
    };
    const draft = await payload.create({
      collection: "articles",
      data: { ...generated, title: "Bitcoin rises", slug: "news-1", externalId: "cluster-1" },
      draft: true,
      locale: "en",
      ...asUser("newsbot"),
    });
    expect(draft).toMatchObject({ externalId: "cluster-1", generatedBy: "template" });
    expect(draft.autoPublished).toBe(false);

    // The same story twice: the unique id refuses the second.
    await expect(
      payload.create({
        collection: "articles",
        data: { ...generated, title: "again", slug: "news-1-b", externalId: "cluster-1" },
        draft: true,
        locale: "en",
        ...asUser("newsbot"),
      }),
    ).rejects.toThrow();

    // Not labeled: it waits for review.
    await expect(
      payload.update({
        collection: "articles",
        id: draft.id,
        data: { _status: "published" },
        locale: "en",
        ...asUser("newsbot"),
      }),
    ).rejects.toThrow(/Only editors and reviewers/);

    const auto = await payload.create({
      collection: "articles",
      data: {
        ...generated,
        title: "Ether moves",
        slug: "news-2",
        externalId: "cluster-2",
        autoPublished: true,
        _status: "published",
      },
      locale: "en",
      ...asUser("newsbot"),
    });
    expect(auto).toMatchObject({ _status: "published", autoPublished: true });
    expect(auto.publishedAt).toBeTruthy();
  });

  it("only the news worker sets the generated labels, and it writes only news", async () => {
    const own = await payload.create({
      collection: "articles",
      data: {
        title: "Mine",
        slug: "author-labels",
        externalId: "cluster-9",
        generatedBy: "template",
        autoPublished: true,
      },
      draft: true,
      locale: "en",
      ...asUser("author"),
    });
    expect(own.externalId ?? null).toBeNull();
    expect(own.generatedBy ?? null).toBeNull();
    expect(own.autoPublished).toBe(false);

    await expect(
      payload.create({
        collection: "articles",
        data: { title: "Guide", slug: "bot-guide", type: "guide" },
        draft: true,
        locale: "en",
        ...asUser("newsbot"),
      }),
    ).rejects.toThrow(/only news/);
  });

  it("keeps corrections with a localized note", async () => {
    const doc = await payload.create({
      collection: "articles",
      data: {
        title: "Corrected",
        slug: "corrected",
        type: "news",
        corrections: [
          { at: "2026-11-09T10:00:00.000Z", kind: "correction", note: "Fixed a figure" },
        ],
      },
      locale: "en",
      ...asUser("editor"),
    });
    expect(doc.corrections).toEqual([
      expect.objectContaining({ kind: "correction", note: "Fixed a figure" }),
    ]);
  });
});
