import { describe, expect, it, vi } from "vitest";
import type { FeedPage } from "@/lib/backend/schemas";
import { CatalogCopy, type FetchFeedPage } from "./catalog";

const asset = (slug: string, at = "2026-11-09T10:00:00Z") => ({
  slug,
  updated_at: at,
  structured_data: { "@type": "Thing", name: slug },
});

describe("catalog copy", () => {
  it("reads the whole feed, then only what changed since its cursor", async () => {
    const pages: Record<string, FeedPage> = {
      start: { items: [asset("b"), asset("a")], next_cursor: "1", has_more: true },
      "1": { items: [asset("c")], next_cursor: "2", has_more: false },
      "2": {
        items: [{ slug: "a", updated_at: "2026-11-09T11:00:00Z", removed: true }],
        next_cursor: "3",
        has_more: false,
      },
    };
    const fetchPage = vi.fn<FetchFeedPage>(async ({ cursor }) => pages[cursor ?? "start"]!);
    const copy = new CatalogCopy(fetchPage);
    await copy.sync();
    expect(copy.live().map((e) => e.slug)).toEqual(["a", "b", "c"]);
    expect(copy.get("b")?.structuredData).toEqual({ "@type": "Thing", name: "b" });

    await copy.sync();
    expect(fetchPage).toHaveBeenLastCalledWith({ cursor: "2", limit: 200 });
    expect(copy.live().map((e) => e.slug)).toEqual(["b", "c"]);
    expect(copy.isRemoved("a")).toBe(true);
    expect(copy.isRemoved("b")).toBe(false);
    expect(copy.isRemoved("unknown")).toBe(false);
  });

  it("shares one sync between concurrent callers, and refreshes a stale copy in the background", async () => {
    let now = 0;
    const fetchPage = vi.fn<FetchFeedPage>(async () => ({
      items: [asset("a")],
      has_more: false,
      next_cursor: "x",
    }));
    const copy = new CatalogCopy(fetchPage, () => now);
    await Promise.all([copy.fresh(1000), copy.fresh(1000), copy.sync()]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    now = 500;
    await copy.fresh(1000);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    now = 5000;
    await copy.fresh(1000);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
