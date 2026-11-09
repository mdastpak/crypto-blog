// @vitest-environment node
const registerOTel = vi.fn();
vi.mock("@vercel/otel", () => ({ registerOTel }));

describe("telemetry", () => {
  it("is off without an OTLP endpoint", async () => {
    const { startTelemetry } = await import("./telemetry");
    expect(startTelemetry({})).toBe(false);
    expect(registerOTel).not.toHaveBeenCalled();
  });

  it("propagates the trace only to the backend and the CMS", async () => {
    const { startTelemetry } = await import("./telemetry");
    expect(
      startTelemetry({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
        BACKEND_API_URL: "https://api.example.com/api/v1",
        CMS_API_URL: "http://cms:3001/api",
      }),
    ).toBe(true);
    expect(registerOTel).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "crypto-blog-web",
        instrumentationConfig: {
          fetch: { propagateContextUrls: ["https://api.example.com", "http://cms:3001"] },
        },
      }),
    );
  });
});
