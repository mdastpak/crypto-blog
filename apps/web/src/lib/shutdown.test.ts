import { isDraining, resetLifecycleForTests } from "./lifecycle";

describe("installShutdownHandlers", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    resetLifecycleForTests();
    process.env.BACKEND_API_URL = "https://api.example.com/api/v1";
    process.env.PUBLIC_SITE_URL = "https://blog.example.com";
    process.env.SHUTDOWN_DRAIN_SECONDS = "3";
  });

  afterEach(() => {
    vi.useRealTimers();
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    process.env = { ...saved };
  });

  it("drains, then exits after the drain period", async () => {
    process.env.NEXT_MANUAL_SIG_HANDLE = "true";
    const { installShutdownHandlers } = await import("./shutdown");
    const exit = vi.fn();
    installShutdownHandlers(exit);

    process.emit("SIGTERM", "SIGTERM");
    expect(isDraining()).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("leaves the signals to Next.js unless manual handling is on", async () => {
    delete process.env.NEXT_MANUAL_SIG_HANDLE;
    const { installShutdownHandlers } = await import("./shutdown");
    installShutdownHandlers(vi.fn());
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });
});
