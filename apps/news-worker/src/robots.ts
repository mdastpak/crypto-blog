/**
 * A small robots.txt reader (RFC 9309): the group for our product token, or
 * else `*`, with Allow/Disallow path prefixes (`*` and `$` supported); the
 * longest matching rule wins, Allow on a tie.
 */
export interface Robots {
  allows(path: string): boolean;
}

interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

function compile(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function parseRobots(text: string, productToken: string): Robots {
  const token = productToken.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (key !== "allow" && key !== "disallow")) continue;
    // An empty Disallow allows everything.
    if (!value) continue;
    current.rules.push({ allow: key === "allow", pattern: compile(value), length: value.length });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  return {
    allows(path: string) {
      let best: Rule | undefined;
      for (const rule of rules) {
        if (!rule.pattern.test(path)) continue;
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}

export const ALLOW_ALL: Robots = { allows: () => true };
export const DISALLOW_ALL: Robots = { allows: () => false };
