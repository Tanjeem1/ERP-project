import type { NextConfig } from "next";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/api/:path*/", destination: `${apiOrigin}/api/:path*/` },
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*/` },
    ];
  },
};

export default nextConfig;
