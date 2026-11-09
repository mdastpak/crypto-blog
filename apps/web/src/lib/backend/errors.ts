const BRAND = Symbol.for("crypto-blog.backend-error");

/**
 * A failed call to the backend. `code` is the backend's stable error code
 * (docs/api.md, "Errors"), or one of ours for failures before an answer:
 * `timeout`, `network_error`, `circuit_open`, `invalid_response`.
 *
 * `instanceof` checks a brand, not the class: the server bundles this module
 * more than once (instrumentation, pages, route handlers), and they share one
 * client through globalThis, so an error may come from another bundle's copy.
 */
export class BackendError extends Error {
  readonly [BRAND] = true;

  static override [Symbol.hasInstance](value: unknown): boolean {
    return typeof value === "object" && value !== null && BRAND in value;
  }

  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "BackendError";
  }

  get notFound(): boolean {
    return this.status === 404;
  }

  /** A failure that a later attempt may not repeat. */
  get transient(): boolean {
    return (
      this.status === 0 ||
      this.status === 429 ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof BackendError && error.notFound;
}
