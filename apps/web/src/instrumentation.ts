/**
 * Runs once when a server process starts. Invalid configuration stops the
 * process with a non-zero code: Next.js only logs a failing hook and goes on
 * serving, which would hide the problem until the first request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ConfigError, getConfig } = await import("./lib/config");
  try {
    getConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  const { installShutdownHandlers } = await import("./lib/shutdown");
  installShutdownHandlers();
}
