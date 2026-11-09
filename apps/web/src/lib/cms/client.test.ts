import { z } from "zod";
import { CircuitBreaker } from "../backend/breaker";
import { CmsClient, CmsError, whereParams } from "./client";

const page = z.object({ docs: z.array(z.object({ slug: z.string() })) });

function client(
  fetchMock: typeof fetch,
  extra: Partial<ConstructorParameters<typeof CmsClient>[0]> = {},
) {
  return new CmsClient({
    baseUrl: "http://cms:3001/api/",
    timeoutMs: 1000,
    fetch: fetchMock,
    sleep: async () => {},
    ...extra,
  });
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("CMS client", () => {
  it("writes Payload's bracket syntax for nested clauses", () => {
    const params = whereParams({
      and: [
        { slug: { equals: "a" } },
        { or: [{ regions: { exists: false } }, { regions: { contains: "ir" } }] },
      ],
    });
    expect([...params]).toEqual([
      ["where[and][0][slug][equals]", "a"],
      ["where[and][1][or][0][regions][exists]", "false"],
      ["where[and][1][or][1][regions][contains]", "ir"],
    ]);
  });

  it("asks for every locale, and caches with the given tags", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ok({ docs: [{ slug: "a" }] }));
    const result = await client(fetchMock).find("articles", page, {
      where: { slug: { equals: "a" } },
      sort: "-publishedAt",
      limit: 1,
      select: ["slug"],
      revalidate: 300,
      tags: ["cms:articles"],
    });
    expect(result.docs[0]!.slug).toBe("a");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { next: unknown },
    ];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/articles");
    expect(parsed.searchParams.get("locale")).toBe("all");
    expect(parsed.searchParams.get("select[slug]")).toBe("true");
    expect(parsed.searchParams.get("draft")).toBeNull();
    expect(init.next).toEqual({ revalidate: 300, tags: ["cms:articles"] });
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("reads drafts only with the preview key, and never caches them", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ok({ docs: [] }));
    await expect(client(fetchMock).find("articles", page, { draft: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await client(fetchMock, { previewApiKey: "k".repeat(36) }).find("articles", page, {
      draft: true,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("draft")).toBe("true");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("authorization")).toBe(`users API-Key ${"k".repeat(36)}`);
  });

  it("retries a transient failure once, but not a 4xx", async () => {
    const flaky = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok({ docs: [] }));
    await expect(client(flaky).find("articles", page)).resolves.toEqual({ docs: [] });
    expect(flaky).toHaveBeenCalledTimes(2);

    const missing = vi.fn<typeof fetch>(async () => new Response("", { status: 404 }));
    await expect(client(missing).find("articles", page)).rejects.toBeInstanceOf(CmsError);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("fails at once while the circuit is open", async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const c = client(down, { breaker: new CircuitBreaker(2, 60_000), retries: 0 });
    await expect(c.find("articles", page)).rejects.toThrow("could not be reached");
    await expect(c.find("articles", page)).rejects.toThrow("could not be reached");
    await expect(c.find("articles", page)).rejects.toMatchObject({ circuitOpen: true });
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("refuses an answer that does not match the schema", async () => {
    const wrong = vi.fn<typeof fetch>(async () => ok({ docs: [{ id: 1 }] }));
    await expect(client(wrong).find("articles", page)).rejects.toThrow("does not match");
  });
});
