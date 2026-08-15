import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mba/domain", "@mba/functions", "firebase-functions", "jwks-rsa", "jose"],
  serverExternalPackages: ["firebase-admin"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
