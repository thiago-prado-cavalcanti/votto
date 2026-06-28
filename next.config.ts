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
};

export default nextConfig;
