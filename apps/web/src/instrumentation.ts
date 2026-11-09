/** Runs once when a server process starts (see lib/startup.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Before anything else, so that the first requests are traced.
  const { startTelemetry } = await import("./lib/telemetry");
  startTelemetry();
  const { startServer } = await import("./lib/startup");
  startServer();
}
