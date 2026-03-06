import type { NextConfig } from "next";

const buildTimeIso = new Date().toISOString();
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME_ISO: buildTimeIso,
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
  images: {
    // Allow remote images for source logos/favicons and article OG images.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/fundgraph",
        destination: "/cerebrosfund",
        permanent: true,
      },
      {
        source: "/fundgraph/:path*",
        destination: "/cerebrosfund/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/cerebrosfund",
        destination: "/fundgraph",
      },
      {
        source: "/cerebrosfund/:path*",
        destination: "/fundgraph/:path*",
      },
    ];
  },
};

export default nextConfig;
