/**
 * A circuit breaker for the backend, one per process. After `threshold`
 * failures in a row it opens, and calls fail at once for `cooldownMs`, so a
 * down backend does not hold every render for the full timeout. Then one
 * call is let through; its success closes the circuit.
 *
 * Each node keeps its own breaker: they open independently, which is enough
 * to shed load, and needs no shared state.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | undefined;
  private probing = false;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): "closed" | "open" | "half-open" {
    if (this.openedAt === undefined) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half-open" : "open";
  }

  /** Whether a call may go out now. */
  allow(): boolean {
    const state = this.state;
    if (state === "closed") return true;
    if (state === "open" || this.probing) return false;
    this.probing = true;
    return true;
  }

  success(): void {
    this.failures = 0;
    this.openedAt = undefined;
    this.probing = false;
  }

  failure(): void {
    this.probing = false;
    this.failures += 1;
    if (this.failures >= this.threshold || this.openedAt !== undefined) {
      this.openedAt = this.now();
    }
  }
}
