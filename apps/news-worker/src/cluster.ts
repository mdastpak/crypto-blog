/** How alike two titles are: the Dice coefficient of their word sets, 0 to 1. */
export function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let shared = 0;
  for (const word of new Set(b)) if (set.has(word)) shared += 1;
  return (2 * shared) / (set.size + new Set(b).size);
}

/** Titles at least this alike are one story. */
export const SAME_STORY = 0.6;

export interface ClusterCandidate {
  id: string;
  tokens: string[];
}

/** The most alike recent cluster, if it is the same story. */
export function bestCluster(
  tokens: readonly string[],
  candidates: readonly ClusterCandidate[],
): ClusterCandidate | undefined {
  let best: ClusterCandidate | undefined;
  let score = 0;
  for (const c of candidates) {
    const s = similarity(tokens, c.tokens);
    if (s > score) {
      score = s;
      best = c;
    }
  }
  return score >= SAME_STORY ? best : undefined;
}
