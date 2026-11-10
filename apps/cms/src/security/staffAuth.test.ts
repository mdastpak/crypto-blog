import { describe, expect, it } from "vitest";
import {
  checkProxy,
  constantTimeEqual,
  needsProxy,
  onlyMachineRoles,
  refuseSignIn,
  type RequestFacts,
} from "./staffAuth";

const secret = "s".repeat(32);
const required = { secret, required: true };
const facts = (over: Partial<RequestFacts>): RequestFacts => ({
  pathname: "/api/articles",
  proxySecret: null,
  authorization: null,
  hasSessionCookie: false,
  ...over,
});

describe("needsProxy", () => {
  it("covers the admin panel and the staff routes", () => {
    expect(needsProxy(facts({ pathname: "/admin" }))).toBe(true);
    expect(needsProxy(facts({ pathname: "/admin/collections/articles" }))).toBe(true);
    expect(needsProxy(facts({ pathname: "/api/users/login" }))).toBe(true);
    expect(needsProxy(facts({ pathname: "/api/users/forgot-password" }))).toBe(true);
  });

  it("covers every request with a staff session", () => {
    expect(needsProxy(facts({ hasSessionCookie: true }))).toBe(true);
    expect(needsProxy(facts({ authorization: "JWT abc" }))).toBe(true);
    expect(needsProxy(facts({ authorization: "Bearer abc" }))).toBe(true);
  });

  it("lets public reads, machines, and health checks through", () => {
    expect(needsProxy(facts({}))).toBe(false);
    expect(needsProxy(facts({ pathname: "/health/ready" }))).toBe(false);
    expect(needsProxy(facts({ authorization: "users API-Key k" }))).toBe(false);
    expect(needsProxy(facts({ pathname: "/api/users/me", authorization: "users API-Key k" }))).toBe(
      false,
    );
    expect(needsProxy(facts({ pathname: "/administrator" }))).toBe(false);
  });
});

describe("checkProxy", () => {
  it("refuses staff requests without the proxy's secret", () => {
    expect(checkProxy(required, facts({ pathname: "/admin" }))).toMatch(/sign-in proxy/);
    expect(checkProxy(required, facts({ pathname: "/admin", proxySecret: "wrong" }))).toMatch(
      /sign-in proxy/,
    );
    expect(checkProxy(required, facts({ pathname: "/admin", proxySecret: secret }))).toBeNull();
  });

  it("refuses everything for staff when the proxy is required but not configured", () => {
    expect(
      checkProxy({ secret: "", required: true }, facts({ pathname: "/admin", proxySecret: "" })),
    ).toMatch(/not configured/);
  });

  it("checks nothing when the proxy is not required", () => {
    expect(checkProxy({ secret: "", required: false }, facts({ pathname: "/admin" }))).toBeNull();
  });
});

describe("refuseSignIn", () => {
  const on = { required: true, emailHeader: "x-auth-request-email", production: true };

  it("signs in only the person the proxy signed in", () => {
    expect(refuseSignIn(on, "Ana@Example.com ", "ana@example.com")).toBeNull();
    expect(refuseSignIn(on, "bob@example.com", "ana@example.com")).toMatch(/proxy/);
    expect(refuseSignIn(on, null, "ana@example.com")).toMatch(/proxy/);
  });

  it("refuses the seed's account in production", () => {
    expect(refuseSignIn(on, "admin@example.com", "admin@example.com")).toMatch(/seed/);
    expect(
      refuseSignIn({ ...on, required: false, production: false }, null, "admin@example.com"),
    ).toBeNull();
  });
});

describe("onlyMachineRoles", () => {
  it("allows API keys to machine accounts only", () => {
    expect(onlyMachineRoles(["newsbot"])).toBe(true);
    expect(onlyMachineRoles(["viewer"])).toBe(true);
    expect(onlyMachineRoles(["viewer", "admin"])).toBe(false);
    expect(onlyMachineRoles(["editor"])).toBe(false);
    expect(onlyMachineRoles([])).toBe(false);
    expect(onlyMachineRoles(undefined)).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
