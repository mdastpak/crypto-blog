import { describe, expect, it, vi } from "vitest";
import { sendRevalidation, tagsFor } from "./revalidate";
import { verify } from "./signature";

const secret = "s".repeat(32);

describe("tagsFor", () => {
  it("names the collection and the document", () => {
    expect(tagsFor("articles", { slug: "hello" })).toEqual(["cms:articles", "cms:articles:hello"]);
    expect(tagsFor("media", { id: 1 })).toEqual(["cms:media"]);
  });
});

describe("sendRevalidation", () => {
  it("posts signed tags to every web deployment", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await sendRevalidation(
      { urls: ["https://a/api/revalidate", "https://b/api/revalidate"], secret },
      ["cms:articles"],
      () => {},
      fetchMock,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://a/api/revalidate");
    expect(init.body).toBe('{"tags":["cms:articles"]}');
    expect(verify(init.body as string, init.headers["X-Signature"], secret)).toBe(true);
  });

  it("retries a failing deployment three times, then logs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    const log = vi.fn();
    await sendRevalidation({ urls: ["https://a"], secret }, ["t"], log, fetchMock, async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith("revalidation of t at https://a failed");
  });

  it("does not retry a refusal", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    const log = vi.fn();
    await sendRevalidation({ urls: ["https://a"], secret }, ["t"], log, fetchMock, async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it("does nothing without targets", async () => {
    const fetchMock = vi.fn();
    await sendRevalidation({ urls: [], secret }, ["t"], () => {}, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
