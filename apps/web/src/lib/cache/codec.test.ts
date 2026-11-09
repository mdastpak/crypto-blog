// @vitest-environment node
import { decode, encode } from "./codec";

describe("cache codec", () => {
  it("keeps Buffers and Maps, nested anywhere", () => {
    const value = {
      kind: "APP_PAGE",
      html: "<p>hi</p>",
      rscData: Buffer.from([0, 1, 2, 255]),
      segmentData: new Map([["/a", Buffer.from("seg")]]),
      headers: { "x-next-cache-tags": "a,b" },
      list: [Buffer.from("x"), { $b: 1 }],
    };
    const back = decode<typeof value>(encode(value));
    expect(Buffer.isBuffer(back.rscData)).toBe(true);
    expect([...back.rscData]).toEqual([0, 1, 2, 255]);
    expect(back.segmentData).toBeInstanceOf(Map);
    expect(back.segmentData.get("/a")?.toString()).toBe("seg");
    expect(back.list[0]?.toString()).toBe("x");
    expect(back.list[1]).toEqual({ $b: 1 });
    expect(back.headers).toEqual(value.headers);
  });
});
