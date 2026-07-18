import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Tree-shake the large HeroUI barrels so each route chunk only ships the
    // components it actually uses, instead of the whole package graph.
    optimizePackageImports: ["@heroui/react", "@heroui-pro/react"],
  },
  async rewrites() {
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!posthogHost) return [];

    return [
      { source: "/ingest/static/:path*", destination: `${posthogHost}/static/:path*` },
      { source: "/ingest/array/:path*", destination: `${posthogHost}/array/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons",
      },
    ],
  },
};

export default nextConfig;
