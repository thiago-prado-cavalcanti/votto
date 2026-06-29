import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server output for a lean production Docker image.
  output: "standalone",
  // Allow remote images for party logos / agent photos imported from official sources.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    // Server Actions are used throughout admin CRUD and public voting.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // Allow the embeddable widgets to be framed on any third-party site. The rest
  // of the app keeps the browser default (same-origin) framing policy.
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
