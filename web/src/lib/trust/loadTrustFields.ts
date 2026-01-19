import type { TrustFieldsDataset, TrustFieldsRecord } from "./schema";

export type TrustFieldIndex = Record<string, TrustFieldsRecord>;

export function indexTrustFields(dataset: TrustFieldsDataset | null | undefined): TrustFieldIndex {
  if (!dataset || !Array.isArray(dataset.entries)) return {};
  return dataset.entries.reduce<TrustFieldIndex>((acc, entry) => {
    acc[entry.articleId] = entry;
    return acc;
  }, {});
}

export async function loadTrustFields(): Promise<TrustFieldIndex> {
  const res = await fetch("/data/trustFields.json", { cache: "no-store" });
  if (!res.ok) return {};
  const json = (await res.json()) as TrustFieldsDataset;
  return indexTrustFields(json);
}
