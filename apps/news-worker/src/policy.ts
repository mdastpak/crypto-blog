import { distinctSources, type Story } from "./writer.ts";

export interface ReviewRules {
  /** 0: never; N: a story reported by at least N sources. */
  autoPublishMinSources: number;
}

export interface Decision {
  publish: boolean;
  reason: string;
}

/**
 * Whether a draft is published at once or waits for an editor. Review is
 * the default; auto-publishing is opt-in, needs enough independent sources,
 * and the CMS labels what it publishes (autoPublished), so readers see it.
 */
export function reviewDecision(story: Story, rules: ReviewRules): Decision {
  const sources = distinctSources(story).length;
  if (rules.autoPublishMinSources <= 0) return { publish: false, reason: "review required" };
  if (sources < rules.autoPublishMinSources) {
    return { publish: false, reason: `${sources} of ${rules.autoPublishMinSources} sources` };
  }
  return { publish: true, reason: `${sources} sources` };
}
