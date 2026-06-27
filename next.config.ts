import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Tree-shake the large HeroUI barrels so each route chunk only ships the
    // components it actually uses, instead of the whole package graph.
    optimizePackageImports: ["@heroui/react", "@heroui-pro/react"],
  },
};

export default nextConfig;
