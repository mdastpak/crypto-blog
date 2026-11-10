import { NextResponse, type NextRequest } from "next/server";
import { proxyRequired } from "./env";
import { checkProxy, PROXY_SECRET_HEADER } from "./security/staffAuth";

/**
 * Lets staff in only through the company's sign-in proxy (#30); see
 * src/security/staffAuth.ts. Read on every request rather than once, so
 * that tests and a changed secret need no rebuild.
 */
export function proxy(request: NextRequest): NextResponse {
  const reason = checkProxy(
    {
      secret: process.env.CMS_AUTH_PROXY_SECRET ?? "",
      required: proxyRequired({
        NODE_ENV: process.env.NODE_ENV ?? "development",
        CMS_AUTH_PROXY_REQUIRED: process.env.CMS_AUTH_PROXY_REQUIRED || undefined,
      }),
    },
    {
      pathname: request.nextUrl.pathname,
      proxySecret: request.headers.get(PROXY_SECRET_HEADER),
      authorization: request.headers.get("authorization"),
      hasSessionCookie: request.cookies.has("payload-token"),
    },
  );
  if (reason) {
    return NextResponse.json({ errors: [{ message: reason }] }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Everything but the build's static files.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
