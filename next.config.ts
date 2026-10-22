import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the browser-test server separate from a running development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
