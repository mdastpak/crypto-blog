import { registerOTel } from "@vercel/otel";

/**
 * OpenTelemetry traces, on when an OTLP endpoint is set
 * (OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, with
 * the other standard OTEL_* settings). Next.js then traces each request,
 * render, and fetch, and calls to the backend and the CMS carry the trace
 * context (`traceparent`), so their spans join the page's trace.
 */
export function startTelemetry(env: Record<string, string | undefined> = process.env): boolean {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT && !env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return false;
  const origins = [env.BACKEND_API_URL, env.CMS_API_URL]
    .filter((url): url is string => Boolean(url))
    .map((url) => new URL(url).origin);
  registerOTel({
    serviceName: env.OTEL_SERVICE_NAME || "crypto-blog-web",
    attributes: { "deployment.region": env.DEPLOYMENT_REGION ?? "ir" },
    // The edge's request ID, to find a request's trace from its access log.
    attributesFromHeaders: { "http.request_id": "x-request-id" },
    instrumentationConfig: { fetch: { propagateContextUrls: origins } },
  });
  return true;
}
