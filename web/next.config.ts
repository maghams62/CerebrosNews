import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow remote images for source logos/favicons and article OG images.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
