import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mba/domain"],
  serverExternalPackages: ["@mba/functions", "firebase-admin", "firebase-functions"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
