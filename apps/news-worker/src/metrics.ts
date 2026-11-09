/** Counters in the Prometheus text format, for /metrics. */
export class Metrics {
  private readonly counters = new Map<string, { help: string; values: Map<string, number> }>();

  constructor() {
    this.define("news_fetches_total", "Feed fetches by source and result.");
    this.define(
      "news_items_total",
      "Items by source and outcome (new_story, joined_story, duplicate, invalid).",
    );
  }

  private define(name: string, help: string) {
    this.counters.set(name, { help, values: new Map() });
  }

  inc(name: string, labels: Record<string, string>, by = 1): void {
    const counter = this.counters.get(name);
    if (!counter) throw new Error(`unknown metric ${name}`);
    const key = Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, "_")}"`)
      .join(",");
    counter.values.set(key, (counter.values.get(key) ?? 0) + by);
  }

  get(name: string, labels: Record<string, string>): number {
    const key = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return this.counters.get(name)?.values.get(key) ?? 0;
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, { help, values }] of this.counters) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [labels, value] of values) lines.push(`${name}{${labels}} ${value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
