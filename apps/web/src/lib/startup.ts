import "server-only";
import { ConfigError, getConfig } from "./config";
import { installShutdownHandlers } from "./shutdown";

/**
 * Start-up of a Node.js server process. Invalid configuration stops the
 * process with a non-zero code: Next.js only logs a failing instrumentation
 * hook and goes on serving, which would hide the problem until the first
 * request.
 */
export function startServer(): void {
  try {
    getConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  installShutdownHandlers();
}
