import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
