import { readFunds } from "@/lib/fundgraph/storage";
import { Fund } from "@/lib/fundgraph/types";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

export async function listFunds(filters?: {
  search?: string;
  sector?: string;
  stage?: string;
  geography?: string;
  limit?: number;
}): Promise<Fund[]> {
  const funds = await readFunds();
  const search = normalize(filters?.search ?? "");
  const sector = normalize(filters?.sector ?? "");
  const stage = normalize(filters?.stage ?? "");
  const geography = normalize(filters?.geography ?? "");

  const filtered = funds.filter((fund) => {
    const matchesSearch =
      !search ||
      fund.name.toLowerCase().includes(search) ||
      fund.gpNames.some((name) => name.toLowerCase().includes(search)) ||
      fund.portfolio.some((company) => company.toLowerCase().includes(search));

    const matchesSector = !sector || fund.sectors.some((entry) => entry.toLowerCase() === sector);
    const matchesStage = !stage || fund.stages.some((entry) => entry.toLowerCase() === stage);
    const matchesGeo = !geography || fund.geographies.some((entry) => entry.toLowerCase() === geography);

    return matchesSearch && matchesSector && matchesStage && matchesGeo;
  });

  return filtered
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(1, Math.min(filters?.limit ?? 100, 200)));
}

export async function getFundById(fundId: string): Promise<Fund | null> {
  const funds = await readFunds();
  return funds.find((fund) => fund.id === fundId || fund.slug === fundId) ?? null;
}
