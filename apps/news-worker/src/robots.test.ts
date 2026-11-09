import { describe, expect, it } from "vitest";
import { parseRobots } from "./robots.ts";

const text = `
# comment
User-agent: *
Disallow: /private
Allow: /private/feed.xml

User-agent: CryptoBlogNewsBot
User-agent: OtherBot
Disallow: /feeds/*.json$
Disallow: /admin
`;

describe("robots.txt", () => {
  it("uses our group when one names us", () => {
    const robots = parseRobots(text, "CryptoBlogNewsBot");
    expect(robots.allows("/admin/x")).toBe(false);
    expect(robots.allows("/feeds/a.json")).toBe(false);
    expect(robots.allows("/feeds/a.json?x")).toBe(true);
    // The * group does not apply to us.
    expect(robots.allows("/private/x")).toBe(true);
  });

  it("falls back to *, the longest rule winning", () => {
    const robots = parseRobots(text, "SomeoneElse");
    expect(robots.allows("/private/x")).toBe(false);
    expect(robots.allows("/private/feed.xml")).toBe(true);
    expect(robots.allows("/rss")).toBe(true);
  });

  it("allows everything for an empty file or an empty Disallow", () => {
    expect(parseRobots("", "x").allows("/a")).toBe(true);
    expect(parseRobots("User-agent: *\nDisallow:", "x").allows("/a")).toBe(true);
  });
});
