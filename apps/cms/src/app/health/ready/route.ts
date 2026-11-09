import config from "@payload-config";
import { getPayload } from "payload";

export const dynamic = "force-dynamic";

/** 200 while the database answers. */
export async function GET(): Promise<Response> {
  try {
    const payload = await getPayload({ config });
    await payload.count({ collection: "users", overrideAccess: true });
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable", reason: "database_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
