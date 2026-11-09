import { mapSettled } from "./concurrency";

it("keeps order, limits concurrency, and tolerates failures", async () => {
  let inFlight = 0;
  let peak = 0;
  const result = await mapSettled([1, 2, 3, 4, 5], 2, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    if (n === 3) throw new Error("boom");
    return n * 10;
  });
  expect(result).toEqual([10, 20, undefined, 40, 50]);
  expect(peak).toBe(2);
});
