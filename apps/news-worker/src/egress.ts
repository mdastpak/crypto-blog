import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";

/**
 * Where the worker may connect: public addresses only. A feed, or a
 * redirect it answers with, must not reach the internal network, the
 * node itself, or a cloud metadata endpoint (docs/news.md#egress).
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network", unspecified
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentation
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** The IPv6 address as 8 groups, or undefined if it is not one. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.split("%")[0]!.toLowerCase();
  // A trailing dotted quad (::ffff:127.0.0.1) becomes two groups.
  const quad = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (quad) {
    const b = quad[1]!.split(".").map(Number);
    text =
      text.slice(0, -quad[1]!.length) +
      `${((b[0]! << 8) | b[1]!).toString(16)}:${((b[2]! << 8) | b[3]!).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const part = (s: string | undefined) => (s ? s.split(":").map((g) => parseInt(g, 16)) : []);
  const left = part(head);
  const right = part(tail);
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : undefined;
}

/** The IPv4 address an IPv6 one carries (mapped, NAT64, 6to4), if any. */
function embeddedIpv4(address: string): string | undefined {
  const g = ipv6Groups(address);
  if (!g) return undefined;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible, deprecated)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return v4(g[6]!, g[7]!);
  }
  // 64:ff9b::a.b.c.d (NAT64)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return v4(g[6]!, g[7]!);
  }
  // 2002:aabb:ccdd::/48 (6to4)
  if (g[0] === 0x2002) return v4(g[1]!, g[2]!);
  return undefined;
}

/** True for an address the worker may connect to: not private, loopback, link-local, and so on. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const v4 = embeddedIpv4(address);
    if (v4 !== undefined) return isPublicAddress(v4);
    return !blocked.check(address.split("%")[0]!, "ipv6");
  }
  return false;
}

export class EgressError extends Error {
  readonly code = "EGRESS_REFUSED";
}

export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export const systemLookup: LookupFn = (hostname) =>
  new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    ),
  );

/** URL hostnames keep IPv6 literals in brackets. */
function bareHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * Resolves a host and refuses it unless every address is public. A name
 * with one private address among public ones is refused too: the
 * connection could pick any of them.
 */
export async function resolvePublic(hostname: string, lookup: LookupFn): Promise<LookupAddress[]> {
  const host = bareHost(hostname);
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await lookup(host);
  if (addresses.length === 0) throw new EgressError(`${host} has no address`);
  const refused = addresses.find((a) => !isPublicAddress(a.address));
  if (refused) {
    throw new EgressError(`${host} resolves to a non-public address (${refused.address})`);
  }
  return addresses;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A `lookup` for a socket's connect options that applies the check to the
 * addresses the connection then uses. The address is checked and dialed
 * from one resolution, so a name that answers public to a first check and
 * private later (DNS rebinding) cannot reach the private address.
 */
export function guardedLookup(lookup: LookupFn = systemLookup) {
  return (
    hostname: string,
    options: { all?: boolean } | number | LookupCallback,
    callback?: LookupCallback,
  ): void => {
    const cb = (typeof options === "function" ? options : callback)!;
    const all = typeof options === "object" && options !== null && options.all === true;
    resolvePublic(hostname, lookup).then(
      (addresses) =>
        all ? cb(null, addresses) : cb(null, addresses[0]!.address, addresses[0]!.family),
      (error: NodeJS.ErrnoException) => cb(error, all ? [] : ""),
    );
  };
}
