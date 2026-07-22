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
  async redirects() {
    return [
      { source: "/visibility", destination: "/checklist", permanent: false },
      // Retired sub-pages fold into the checklist, but the audit report detail
      // route (/visibility/[auditId]) stays live for per-audit history + exports.
      { source: "/visibility/:page(health|answers|fixes)", destination: "/checklist", permanent: false },
      { source: "/reports", destination: "/checklist", permanent: false },
      { source: "/reports/:path*", destination: "/checklist", permanent: false },
      { source: "/tools", destination: "/checklist", permanent: false },
      { source: "/tools/:path*", destination: "/checklist", permanent: false },
      { source: "/activity", destination: "/dashboard", permanent: false },
      { source: "/activity/:path*", destination: "/dashboard", permanent: false },
      { source: "/work", destination: "/dashboard", permanent: false },
      { source: "/work/:path*", destination: "/dashboard", permanent: false },
      { source: "/topics", destination: "/articles?view=ideas", permanent: false },
      { source: "/topics/:path*", destination: "/articles?view=ideas", permanent: false },
      { source: "/inbox", destination: "/dashboard#needs-input", permanent: false },
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
