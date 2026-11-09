import "server-only";
import { getConfig } from "./config";
import { startDraining } from "./lifecycle";
import { logger } from "@/lib/log";

let installed = false;

/**
 * Graceful shutdown for a node behind a load balancer. On SIGTERM or SIGINT
 * readiness turns to 503 at once, so the balancer stops sending new requests,
 * and the process keeps serving the requests in flight for
 * SHUTDOWN_DRAIN_SECONDS before it exits.
 *
 * Next.js handles these signals itself unless NEXT_MANUAL_SIG_HANDLE=true,
 * which the container image sets.
 */
export function installShutdownHandlers(exit: (code: number) => void = process.exit): void {
  if (installed || process.env.NEXT_MANUAL_SIG_HANDLE !== "true") return;
  installed = true;
  const onSignal = (signal: NodeJS.Signals) => {
    logger.info("draining", { signal });
    startDraining();
    const seconds = getConfig().shutdownDrainSeconds;
    setTimeout(() => exit(0), seconds * 1000).unref();
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}
