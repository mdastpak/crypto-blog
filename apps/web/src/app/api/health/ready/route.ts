import { readiness } from "@/lib/health";

export const dynamic = "force-dynamic";

/** 200 while this node should receive traffic, 503 with a reason otherwise. */
export function GET(): Response {
  const result = readiness();
  return Response.json(result, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
