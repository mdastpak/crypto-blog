// @vitest-environment node
import { MemoryStore } from "./store";

describe("memory store", () => {
  it("expires entries and drops the least recently used", async () => {
    let now = 0;
    const store = new MemoryStore(2, () => now);
    await store.set("a", "1", 10);
    await store.set("b", "2", 10);
    expect(await store.get("a")).toBe("1");
    await store.set("c", "3", 10);
    expect(await store.get("b")).toBeNull();
    expect(await store.get("a")).toBe("1");
    now = 10_000;
    expect(await store.get("a")).toBeNull();
  });

  it("keeps the latest mark of a tag", async () => {
    const store = new MemoryStore();
    await store.markTags(["t"], 200);
    await store.markTags(["t", "u"], 100);
    expect(await store.tagTimes(["t", "u", "v"])).toEqual(
      new Map([
        ["t", 200],
        ["u", 100],
      ]),
    );
  });
});
