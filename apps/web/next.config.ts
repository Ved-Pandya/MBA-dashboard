import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mba/domain", "@mba/functions", "firebase-admin", "firebase-functions", "jwks-rsa", "jose"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
