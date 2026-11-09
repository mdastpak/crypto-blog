// @vitest-environment node
import { log } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("structured logs", () => {
  it("writes one JSON line, errors to stderr, and drops levels below LOG_LEVEL", () => {
    const saved = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      log("debug", "hidden");
      log("info", "hello", { n: 1 });
      log("error", "failed", { error: new Error("boom") });
      expect(out).toHaveBeenCalledOnce();
      expect(JSON.parse(String(out.mock.calls[0]![0]))).toMatchObject({
        level: "info",
        msg: "hello",
        n: 1,
      });
      expect(JSON.parse(String(err.mock.calls[0]![0]))).toMatchObject({
        level: "error",
        error: { name: "Error", message: "boom" },
      });
    } finally {
      process.env.LOG_LEVEL = saved;
    }
  });
});
