export const dynamic = "force-dynamic";

/** 200 while the process runs. */
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
