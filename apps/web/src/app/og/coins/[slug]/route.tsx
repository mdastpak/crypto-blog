import { ImageResponse } from "next/og";
import { getBrand, resolvePalette } from "@/design/brands";
import { isNotFound, marketData } from "@/lib/backend";
import { getConfig } from "@/lib/config";

/**
 * The Open Graph image of a coin page (1200×630): the coin's name and
 * symbol on the brand's colors. Latin text only: the catalog names coins
 * in English, and the image font has no Persian.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  let asset;
  try {
    asset = await marketData.getAsset(slug);
  } catch (error) {
    if (isNotFound(error)) return new Response("Not found", { status: 404 });
    throw error;
  }
  const brand = getBrand(getConfig().brand);
  const palette = resolvePalette(brand, "dark");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: palette.background,
        color: palette.text,
        fontSize: 40,
      }}
    >
      <div style={{ display: "flex", color: palette.primary, fontSize: 36, fontWeight: 700 }}>
        {brand.name.en}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>{asset.name}</div>
        <div style={{ display: "flex", gap: 24, color: palette["text-muted"] }}>
          <span>{asset.symbol}</span>
          {asset.market_cap_rank ? <span>Rank #{asset.market_cap_rank}</span> : null}
        </div>
      </div>
      <div style={{ display: "flex", color: palette["text-muted"], fontSize: 28 }}>
        Price, chart, and prices on each exchange
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
