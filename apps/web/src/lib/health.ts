import "server-only";
import { getConfig } from "./config";
import { isDraining } from "./lifecycle";

export interface Readiness {
  status: "ok" | "unavailable";
  reason?: "draining" | "invalid_config";
}

/**
 * Whether this node should receive traffic. It deliberately does not depend
 * on the backend or the CMS: when they are down every node would leave the
 * load balancer at once, while the pages can still be served from the cache.
 */
export function readiness(): Readiness {
  if (isDraining()) return { status: "unavailable", reason: "draining" };
  try {
    getConfig();
  } catch {
    return { status: "unavailable", reason: "invalid_config" };
  }
  return { status: "ok" };
}
