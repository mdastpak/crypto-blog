import { describe, expect, it } from "vitest";
import { canPublish, canWrite, hasRole } from "./roles";

describe("roles", () => {
  const user = (...roles: string[]) => ({ id: 1, roles });

  it.each([
    ["admin", true, true],
    ["editor", true, true],
    ["reviewer", true, false],
    ["author", false, true],
    ["viewer", false, false],
    ["newsbot", false, true],
  ])("%s: publish %s, write %s", (role, publish, write) => {
    expect(canPublish(user(role))).toBe(publish);
    expect(canWrite(user(role))).toBe(write);
  });

  it("an anonymous visitor has no role", () => {
    expect(hasRole(null, "admin")).toBe(false);
    expect(canWrite(undefined)).toBe(false);
  });
});
