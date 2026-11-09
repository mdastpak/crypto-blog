import { describe, expect, it, vi } from "vitest";
import {
  ChannelError,
  TelegramChannel,
  XChannel,
  telegramText,
  xText,
  type ChannelFetch,
} from "./channels.ts";

const post = {
  title: "BTC <up> & away",
  summary: "Two sources.",
  url: "https://blog.example/en/blog/x",
};

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("telegram", () => {
  const config = {
    kind: "telegram" as const,
    id: "telegram:@news",
    token: "123:abc",
    chatId: "@news",
    locale: "fa" as const,
  };

  it("escapes HTML and puts the link last", () => {
    expect(telegramText(post)).toBe(
      "<b>BTC &lt;up&gt; &amp; away</b>\n\nTwo sources.\n\nhttps://blog.example/en/blog/x",
    );
  });

  it("sends through this node's egress and returns the message id", async () => {
    const fetch = vi.fn<ChannelFetch>(async () =>
      reply(200, { ok: true, result: { message_id: 42 } }),
    );
    const dispatcher = {} as never;
    const id = await new TelegramChannel(config, { fetch, dispatcher }).send(post);
    expect(id).toBe("42");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(init.dispatcher).toBe(dispatcher);
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: "@news", parse_mode: "HTML" });
  });

  it("retries a rate limit after the time Telegram asks, and not a rejection", async () => {
    const limited = new TelegramChannel(config, {
      fetch: async () =>
        reply(429, {
          ok: false,
          description: "Too Many Requests",
          parameters: { retry_after: 30 },
        }),
    });
    await expect(limited.send(post)).rejects.toMatchObject({
      retryable: true,
      retryAfterSeconds: 30,
    });
    const rejected = new TelegramChannel(config, {
      fetch: async () => reply(400, { ok: false, description: "chat not found" }),
    });
    await expect(rejected.send(post)).rejects.toMatchObject({ retryable: false });
    const down = new TelegramChannel(config, {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const error = await down.send(post).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChannelError);
    expect((error as ChannelError).retryable).toBe(true);
  });
});

describe("x", () => {
  const config = { kind: "x" as const, id: "x", token: "t".repeat(30), locale: "en" as const };

  it("fits the title and link in 280 characters", () => {
    expect(xText(post)).toBe("BTC <up> & away https://blog.example/en/blog/x");
    const long = xText({ ...post, title: "a".repeat(400) });
    const [title] = long.split(" ");
    expect([...title!].length + 1 + 23).toBe(280);
  });

  it("posts with the access token and returns the post id", async () => {
    const fetch = vi.fn<ChannelFetch>(async () => reply(201, { data: { id: "99" } }));
    expect(await new XChannel(config, { fetch }).send(post)).toBe("99");
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${"t".repeat(30)}`);
  });

  it("treats an expired token as a failure, not a retry", async () => {
    const channel = new XChannel(config, {
      fetch: async () => reply(401, { title: "Unauthorized" }),
    });
    await expect(channel.send(post)).rejects.toMatchObject({ retryable: false });
  });
});
