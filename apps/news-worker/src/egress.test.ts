import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Agent, fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardedLookup, isPublicAddress, resolvePublic, type LookupFn } from "./egress.ts";
import { checkSourceHosts, parseSources } from "./sources.ts";

describe("public addresses", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.5.4",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.254",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "64:ff9b::10.0.0.1",
    "2002:c0a8:0101::1",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "93.184.215.14",
    "1.1.1.1",
    "100.128.0.1",
    "172.32.0.1",
    "2606:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("refuses a name with any non-public address among its answers", async () => {
    const lookup: LookupFn = async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ];
    await expect(resolvePublic("mixed.example", lookup)).rejects.toThrow("10.0.0.1");
    await expect(resolvePublic("[::1]", lookup)).rejects.toThrow("non-public");
  });
});

describe("connect-time check", () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((_, res) => res.end("internal"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("does not reach a private address after DNS rebinding", async () => {
    // Public for the first check, the loopback server for every later answer.
    let answers = 0;
    const rebinding: LookupFn = async () => [
      { address: answers++ === 0 ? "93.184.215.14" : "127.0.0.1", family: 4 },
    ];
    await resolvePublic("rebind.example", rebinding);
    const agent = new Agent({ connect: { lookup: guardedLookup(rebinding) } });
    const outcome = await fetch(`http://rebind.example:${port}/`, { dispatcher: agent }).then(
      (r) => r.text(),
      (error: Error) => error,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(String((outcome as Error).cause)).toContain("non-public address (127.0.0.1)");
    await agent.close();
  });
});

describe("sources file hosts", () => {
  const sources = parseSources({
    sources: [
      { id: "aa", name: "A", url: "https://a.example/feed", language: "en", region: "global" },
      { id: "bb", name: "B", url: "http://10.0.0.8/feed", language: "en", region: "global" },
      { id: "cc", name: "C", url: "https://cms.internal/rss", language: "en", region: "global" },
      { id: "dd", name: "D", url: "https://gone.example/rss", language: "en", region: "global" },
    ],
  });
  const lookup: LookupFn = async (host) => {
    if (host === "gone.example") throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return [{ address: host === "cms.internal" ? "172.20.0.3" : "93.184.215.14", family: 4 }];
  };

  it("refuses feeds on non-public addresses, all reported at once", async () => {
    await expect(checkSourceHosts(sources, { lookup })).rejects.toThrow(
      /sources\.1\.url \(bb\)[\s\S]*sources\.2\.url \(cc\)/,
    );
  });

  it("lets a name that does not resolve now through, and anything with allowPrivate", async () => {
    await expect(checkSourceHosts([sources[0]!, sources[3]!], { lookup })).resolves.toBeUndefined();
    await expect(
      checkSourceHosts(sources, { lookup, allowPrivate: true }),
    ).resolves.toBeUndefined();
  });
});
