import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle for the container image.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
