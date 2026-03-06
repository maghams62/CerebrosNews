import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

const WEB_ROOT = process.cwd();
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "artifacts", "deploy_parity.json");
const PUBLIC_ARTIFACT_PATH = path.join(WEB_ROOT, "public", "data", "fundgraph", "deploy_parity.json");

function parseArgs(argv: string[]): { url: string } {
  const urlFlag = argv.find((arg) => arg.startsWith("--url="));
  const directUrl = argv.find((arg) => /^https?:\/\//i.test(arg));
  const url = (urlFlag ? urlFlag.slice("--url=".length) : directUrl || "").trim();
  if (!url) {
    throw new Error("missing_url_argument");
  }
  return { url };
}

function normalizeSha(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function resolveGitSha(): string {
  const envSha = process.env.GIT_COMMIT_SHA?.trim();
  if (envSha) return envSha;
  return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function verifyParity(url: string): Promise<void> {
  const target = `${url.replace(/\/+$/, "")}/api/build-meta`;
  const response = await fetch(target, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`build_meta_request_failed:${response.status}`);
  }
  const payload = (await response.json()) as { commitSha?: string; buildTime?: string };
  const gitSha = resolveGitSha();
  const deployedSha = payload.commitSha ?? "";
  const pass = normalizeSha(gitSha) === normalizeSha(deployedSha);
  const artifact = {
    verified_at: new Date().toISOString(),
    deployed_url: url.replace(/\/+$/, ""),
    commit_sha_git: gitSha,
    commit_sha_deployed: deployedSha,
    build_time_deployed: payload.buildTime ?? "unknown",
    parity_pass: pass,
  };

  await Promise.all([writeJson(ARTIFACT_PATH, artifact), writeJson(PUBLIC_ARTIFACT_PATH, artifact)]);
  console.log(
    `[deploy-parity] git_sha=${gitSha} deployed_sha=${deployedSha || "missing"} pass=${pass} artifact=${ARTIFACT_PATH}`
  );
  if (!pass) {
    process.exitCode = 1;
  }
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  await verifyParity(url);
}

main().catch((error) => {
  console.error("[deploy-parity] failed", error);
  process.exit(1);
});
