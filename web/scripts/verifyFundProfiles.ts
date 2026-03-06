import { buildFundAiSummary } from "../src/lib/fundgraph/fundAiSummary";
import { getFundLinkedinUrl, getPortfolioCompanyProfile } from "../src/lib/fundgraph/fundEntityProfiles";
import { readFunds, readSignals } from "../src/lib/fundgraph/storage";

type Issue = {
  fundName: string;
  message: string;
};

const PLACEHOLDER_FOUNDERS = new Set([
  "aarav mehta",
  "julia chen",
  "nadia kim",
  "daniel ortiz",
  "ravi patel",
  "chloe park",
  "mina shah",
  "ethan cole",
]);

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function fetchStatus(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 fundgraph-verifier/1.0",
      },
    });
    return response.status;
  } catch {
    return null;
  }
}

async function main() {
  const [funds, signals] = await Promise.all([readFunds(), readSignals()]);
  const issues: Issue[] = [];
  const summaryRows: Array<{
    fundName: string;
    signals: number;
    founders: number;
    coInvestors: number;
    linkedinStatus: string;
  }> = [];

  for (const fund of funds) {
    const fundSignals = signals.filter((signal) => signal.fundId === fund.id);
    const aiSummary = buildFundAiSummary(fund, fundSignals);
    if (!aiSummary.summary.trim()) {
      issues.push({ fundName: fund.name, message: "Missing AI synthesis summary." });
    }
    if (!aiSummary.insights.length) {
      issues.push({ fundName: fund.name, message: "Missing AI synthesis insights." });
    }

    const expectedLinkedin = getFundLinkedinUrl(fund);
    const actualLinkedin = fund.gp.linkedinUrl;
    if (!isValidUrl(actualLinkedin)) {
      issues.push({ fundName: fund.name, message: "Missing or invalid LinkedIn URL." });
    }
    if (expectedLinkedin && actualLinkedin && expectedLinkedin !== actualLinkedin) {
      issues.push({
        fundName: fund.name,
        message: `LinkedIn URL mismatch. expected=${expectedLinkedin} actual=${actualLinkedin}`,
      });
    }

    const linkedinStatus = actualLinkedin ? await fetchStatus(actualLinkedin) : null;
    if (actualLinkedin && linkedinStatus === 404) {
      issues.push({ fundName: fund.name, message: "LinkedIn URL returned 404." });
    }

    const placeholderFounders = (fund.founders ?? []).filter((name) => PLACEHOLDER_FOUNDERS.has(name.trim().toLowerCase()));
    if (placeholderFounders.length) {
      issues.push({
        fundName: fund.name,
        message: `Placeholder founder names still present: ${placeholderFounders.join(", ")}`,
      });
    }

    if (!(fund.founders ?? []).length) {
      issues.push({ fundName: fund.name, message: "No founders populated." });
    }

    for (const company of fund.portfolio ?? []) {
      const profile = getPortfolioCompanyProfile(company);
      if (!profile) {
        issues.push({ fundName: fund.name, message: `Missing company profile mapping: ${company}` });
        continue;
      }
      if (!isValidUrl(profile.url)) {
        issues.push({ fundName: fund.name, message: `Missing/invalid company URL: ${profile.canonicalName}` });
      } else {
        const status = await fetchStatus(profile.url as string);
        if (status === 404) {
          issues.push({ fundName: fund.name, message: `Company URL returned 404: ${profile.canonicalName}` });
        }
      }
    }

    summaryRows.push({
      fundName: fund.name,
      signals: fundSignals.length,
      founders: (fund.founders ?? []).length,
      coInvestors: (fund.coInvestors ?? []).length,
      linkedinStatus: actualLinkedin ? String(linkedinStatus ?? "unreachable") : "missing",
    });
  }

  console.log("[fundgraph:verify-funds] Fund profile verification snapshot");
  console.table(summaryRows);

  if (issues.length) {
    console.log("\nIssues:");
    for (const issue of issues) {
      console.log(`- ${issue.fundName}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nNo issues found.");
}

main().catch((error) => {
  console.error("[fundgraph:verify-funds] failed", error);
  process.exitCode = 1;
});

