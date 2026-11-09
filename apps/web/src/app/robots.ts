import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";

// Each deployment is one site: its robots.txt names its own sitemap.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const { publicSiteUrl, locales } = getConfig();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API routes, the CMS media proxy, and the design gallery are not pages to index.
      disallow: ["/api/", ...locales.map((l) => `/${l}/design`)],
    },
    sitemap: `${publicSiteUrl}/sitemap.xml`,
    host: publicSiteUrl,
  };
}
