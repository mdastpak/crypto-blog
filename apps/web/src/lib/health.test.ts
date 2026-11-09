import { readiness } from "./health";
import { resetLifecycleForTests, startDraining } from "./lifecycle";

describe("readiness", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    resetLifecycleForTests();
    vi.resetModules();
    process.env.BACKEND_API_URL = "https://api.example.com/api/v1";
    process.env.PUBLIC_SITE_URL = "https://blog.example.com";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("is ok while running", () => {
    expect(readiness()).toEqual({ status: "ok" });
  });

  it("fails once draining", () => {
    startDraining();
    expect(readiness()).toEqual({ status: "unavailable", reason: "draining" });
  });

  it("fails on invalid configuration", async () => {
    delete process.env.BACKEND_API_URL;
    const { readiness: fresh } = await import("./health");
    expect(fresh()).toEqual({ status: "unavailable", reason: "invalid_config" });
  });
});
