import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveCommitSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    "unknown"
  );
}

function resolveBuildTime(): string {
  return process.env.NEXT_PUBLIC_BUILD_TIME_ISO || process.env.BUILD_TIME_ISO || "unknown";
}

export async function GET() {
  return NextResponse.json({
    commitSha: resolveCommitSha(),
    buildTime: resolveBuildTime(),
    verifiedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || (process.env.NODE_ENV === "production" ? "production" : "development"),
  });
}
