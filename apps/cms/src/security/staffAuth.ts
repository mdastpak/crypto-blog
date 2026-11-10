/**
 * How CMS staff sign in (#30). A password alone does not protect an account
 * that can publish under the exchange's name, so in production every staff
 * sign-in and every staff session must come through an identity-aware proxy
 * (oauth2-proxy, Pomerium, Cloudflare Access, ...) that signs the person in
 * with the company's identity provider and its second factor:
 *
 * - The proxy adds a shared secret header (CMS_AUTH_PROXY_SECRET) to every
 *   request it forwards, and the email of the person it signed in
 *   (CMS_AUTH_PROXY_EMAIL_HEADER, X-Auth-Request-Email by default).
 * - checkProxy (apps/cms/src/proxy.ts) refuses, without the secret, the
 *   admin panel, the sign-in route, and every request that carries a staff
 *   session. Requests without credentials, which can only read published
 *   documents, and API-key requests pass: API keys are for the machine
 *   roles only (MACHINE_ROLES), the news worker and the blog's preview,
 *   which reach the CMS on the internal network.
 * - The beforeLogin hook of users signs in only the person the proxy
 *   signed in, so a stolen password of one account is no use to another
 *   person who passed the proxy.
 *
 * CMS_AUTH_PROXY_REQUIRED=false turns the requirement off in production, for
 * a deployment that cannot run a proxy yet; the CMS then logs a warning at
 * every start.
 */
import type { Role } from "../access/roles";

/** The roles that may hold an API key: machines, never people. */
export const MACHINE_ROLES: readonly Role[] = ["newsbot", "viewer"];

/** The header in which the proxy sends the shared secret. */
export const PROXY_SECRET_HEADER = "x-cms-proxy-secret";

/** The default header of the email of the person the proxy signed in. */
export const DEFAULT_PROXY_EMAIL_HEADER = "x-auth-request-email";

/** The seed's account (src/seed/run.ts), refused in production. */
export const SEED_EMAIL = "admin@example.com";

export interface ProxySettings {
  /** The shared secret; empty when no proxy is configured. */
  secret: string;
  /** Whether requests must come through the proxy. */
  required: boolean;
}

/** Compares two strings in time that does not depend on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export interface RequestFacts {
  pathname: string;
  /** The value of the proxy secret header, or null. */
  proxySecret: string | null;
  /** The Authorization header, or null. */
  authorization: string | null;
  /** Whether the payload-token session cookie is present. */
  hasSessionCookie: boolean;
}

/** Whether a request authenticates with an API key ("users API-Key ..."). */
export function usesApiKey(authorization: string | null): boolean {
  return !!authorization && /^\S+ API-Key \S+/.test(authorization);
}

/**
 * Whether a request must come through the proxy: the admin panel, the
 * staff authentication routes, and every request that carries a staff
 * session (a cookie, or a JWT in Authorization).
 */
export function needsProxy({ pathname, authorization, hasSessionCookie }: RequestFacts): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/api/users/")) {
    // A machine reads its own account with its key.
    return !usesApiKey(authorization);
  }
  if (hasSessionCookie) return true;
  return !!authorization && !usesApiKey(authorization);
}

/**
 * Decides a request: null lets it through, a string is why it is refused.
 */
export function checkProxy(settings: ProxySettings, facts: RequestFacts): string | null {
  if (!settings.required || !needsProxy(facts)) return null;
  if (!settings.secret) return "the CMS requires its sign-in proxy, which is not configured";
  if (!facts.proxySecret || !constantTimeEqual(facts.proxySecret, settings.secret)) {
    return "staff sign in through the company's sign-in proxy";
  }
  return null;
}

/**
 * Whether the person the proxy signed in may sign in as the account with
 * this email. Without a required proxy, nothing is compared.
 */
export function sameStaffMember(
  required: boolean,
  proxyEmail: string | null,
  accountEmail: string,
): boolean {
  if (!required) return true;
  return !!proxyEmail && proxyEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

/** Whether roles are machine roles only, so that the account may hold an API key. */
export function onlyMachineRoles(roles: readonly string[] | null | undefined): boolean {
  return (
    !!roles &&
    roles.length > 0 &&
    roles.every((r) => (MACHINE_ROLES as readonly string[]).includes(r))
  );
}

export interface StaffAuthSettings {
  /** Whether staff must come through the proxy. */
  required: boolean;
  /** The header of the email the proxy signed in, in lower case. */
  emailHeader: string;
  /** Whether this is a production deployment, where the seed's account is refused. */
  production: boolean;
}

let settings: StaffAuthSettings = {
  required: false,
  emailHeader: DEFAULT_PROXY_EMAIL_HEADER,
  production: false,
};

/** Sets how staff sign in; called once by payload.config.ts. */
export function configureStaffAuth(next: StaffAuthSettings): void {
  settings = next;
}

/** How staff sign in, as configured. */
export function staffAuthSettings(): StaffAuthSettings {
  return settings;
}

/**
 * Why a sign-in is refused, or null: the account is not the person the
 * proxy signed in, or it is the seed's account in production.
 */
export function refuseSignIn(
  current: StaffAuthSettings,
  proxyEmail: string | null,
  accountEmail: string,
): string | null {
  if (current.production && accountEmail.trim().toLowerCase() === SEED_EMAIL) {
    return "the seed's account cannot sign in in production";
  }
  if (!sameStaffMember(current.required, proxyEmail, accountEmail)) {
    return "sign in with the account of the person the sign-in proxy signed in";
  }
  return null;
}
