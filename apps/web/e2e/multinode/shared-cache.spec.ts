import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { MOCK_URL, NODES, REVALIDATE_SECRET } from "../../playwright.multinode.config";

const [A, B] = NODES as [string, string];
const PATH = "/en/blog/what-is-bitcoin";

async function title(request: APIRequestContext, node: string) {
  const response = await request.get(node + PATH);
  expect(response.status()).toBe(200);
  const html = await response.text();
  return {
    h1: /<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1],
    cache: response.headers()["x-nextjs-cache"],
  };
}

test("two nodes share rendered pages and a revalidation sent to either", async ({ request }) => {
  // Node A renders the page and stores it in the shared cache.
  expect((await title(request, A)).h1).toBe("What is Bitcoin?");

  // An editor changes the title; the CMS has not called the webhook yet.
  const retitle = await request.post(
    `${MOCK_URL}/cms/api/__mock/retitle?slug=what-is-bitcoin&en=${encodeURIComponent("Bitcoin, explained")}`,
  );
  expect(retitle.status()).toBe(204);

  // Node B never rendered the page, yet serves A's copy from the cache.
  const fromB = await title(request, B);
  expect(fromB.h1).toBe("What is Bitcoin?");
  expect(fromB.cache).toBe("HIT");

  // The webhook reaches B only.
  const body = JSON.stringify({ tags: ["cms:articles", "cms:articles:what-is-bitcoin"] });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", REVALIDATE_SECRET).update(`${t}.${body}`).digest("hex");
  const hook = await request.post(`${B}/api/revalidate`, {
    data: body,
    headers: { "content-type": "application/json", "x-signature": `t=${t},v1=${v1}` },
  });
  expect(hook.status()).toBe(200);

  // Node A renders the new title at once; afterwards B serves it too.
  expect((await title(request, A)).h1).toBe("Bitcoin, explained");
  await expect.poll(async () => (await title(request, B)).h1).toBe("Bitcoin, explained");
});
