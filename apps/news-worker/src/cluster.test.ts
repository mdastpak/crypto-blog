import { describe, expect, it } from "vitest";
import { bestCluster, similarity } from "./cluster.ts";
import { titleTokens } from "./normalize.ts";

describe("stories", () => {
  it("finds the same story under different headlines", () => {
    const a = titleTokens("Bitcoin Tops $70,000 as ETF Inflows Surge");
    const b = titleTokens("Bitcoin tops $70,000 as ETF inflows surge to record");
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.6);
    const other = titleTokens("Cardano upgrade goes live");
    expect(similarity(a, other)).toBe(0);
    expect(
      bestCluster(b, [
        { id: "1", tokens: other },
        { id: "2", tokens: a },
      ])?.id,
    ).toBe("2");
    expect(bestCluster(other, [{ id: "2", tokens: a }])).toBeUndefined();
  });
});
