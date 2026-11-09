import type { Dispatcher } from "undici";
import type { ChannelConfig } from "./config.ts";

/** What the outbox stores for a post; channels format it their own way. */
export interface PostPayload {
  title: string;
  summary?: string;
  url: string;
}

export class ChannelError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ChannelError";
  }
}

export type ChannelFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    dispatcher?: Dispatcher;
  },
) => Promise<Response>;

export interface Channel {
  readonly id: string;
  /** Posts once; returns the channel's id of the post. */
  send(post: PostPayload): Promise<string>;
}

interface Deps {
  fetch: ChannelFetch;
  /** This node's egress (NEWS_HTTP_PROXY): Telegram and X are blocked in some regions. */
  dispatcher?: Dispatcher;
  timeoutMs?: number;
}

async function post(deps: Deps, url: string, headers: Record<string, string>, body: unknown) {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
      dispatcher: deps.dispatcher,
    });
  } catch (error) {
    throw new ChannelError(`network: ${error instanceof Error ? error.message : error}`, true);
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, json };
}

function failure(status: number, detail: string, retryAfter?: number): ChannelError {
  // A rejected post (bad token, bad chat, duplicate) does not get better by retrying.
  const retryable = status === 429 || status >= 500;
  return new ChannelError(`HTTP ${status}: ${detail}`, retryable, retryAfter);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A Telegram message: bold title, the summary, and the link (shown as a preview). */
export function telegramText(p: PostPayload): string {
  const parts = [`<b>${escapeHtml(p.title)}</b>`];
  if (p.summary) parts.push(escapeHtml(p.summary));
  parts.push(escapeHtml(p.url));
  return parts.join("\n\n").slice(0, 4096);
}

export class TelegramChannel implements Channel {
  readonly id: string;

  constructor(
    private readonly config: Extract<ChannelConfig, { kind: "telegram" }>,
    private readonly deps: Deps,
  ) {
    this.id = config.id;
  }

  async send(p: PostPayload): Promise<string> {
    const { response, json } = await post(
      this.deps,
      `https://api.telegram.org/bot${this.config.token}/sendMessage`,
      {},
      { chat_id: this.config.chatId, text: telegramText(p), parse_mode: "HTML" },
    );
    if (response.ok && json.ok) {
      return String((json.result as { message_id?: number } | undefined)?.message_id ?? "");
    }
    const retryAfter = (json.parameters as { retry_after?: number } | undefined)?.retry_after;
    throw failure(response.status, String(json.description ?? "rejected"), retryAfter);
  }
}

/** X counts every link as 23 characters. */
const X_LIMIT = 280;
const X_LINK = 23;

/** A post on X: the title, cut to fit, and the link. */
export function xText(p: PostPayload): string {
  const room = X_LIMIT - X_LINK - 1;
  const chars = [...p.title];
  const title =
    chars.length <= room
      ? p.title
      : `${chars
          .slice(0, room - 1)
          .join("")
          .trimEnd()}…`;
  return `${title} ${p.url}`;
}

/**
 * Posts with the X API v2 and a user-context OAuth 2 access token
 * (X_ACCESS_TOKEN, scope tweet.write). Refreshing the token is outside the
 * worker: rotate it in the secret store.
 */
export class XChannel implements Channel {
  readonly id: string;

  constructor(
    private readonly config: Extract<ChannelConfig, { kind: "x" }>,
    private readonly deps: Deps,
  ) {
    this.id = config.id;
  }

  async send(p: PostPayload): Promise<string> {
    const { response, json } = await post(
      this.deps,
      "https://api.x.com/2/tweets",
      { Authorization: `Bearer ${this.config.token}` },
      { text: xText(p) },
    );
    if (response.ok) return String((json.data as { id?: string } | undefined)?.id ?? "");
    const reset = Number(response.headers.get("x-rate-limit-reset"));
    const retryAfter =
      response.status === 429 && Number.isFinite(reset) && reset > 0
        ? Math.max(1, Math.ceil(reset - Date.now() / 1000))
        : undefined;
    throw failure(response.status, String(json.detail ?? json.title ?? "rejected"), retryAfter);
  }
}

export function createChannel(config: ChannelConfig, deps: Deps): Channel {
  return config.kind === "telegram"
    ? new TelegramChannel(config, deps)
    : new XChannel(config, deps);
}
