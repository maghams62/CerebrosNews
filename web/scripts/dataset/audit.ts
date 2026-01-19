import fs from "fs/promises";
import path from "path";
import { DatasetFile } from "./schema";
import { PLACEHOLDER_PUBLIC_PATH } from "./image";

export type AuditMetrics = {
  items: number;
  stories: number;
  imgMissing: number;
  imgMissingPct: number;
  imgBroken: number;
  imgBrokenPct: number;
  clustersOneSource: number;
  clustersOneSourcePct: number;
  clustersLT3: number;
  clustersLT3Pct: number;
  shortText: number;
  shortTextPct: number;
  titleOnly: number;
  titleOnlyPct: number;
};

export function computeAudit(dataset: DatasetFile, publicDir: string): AuditMetrics {
  const items = dataset.items ?? [];
  const stories = dataset.stories ?? [];

  const imgMissing = items.filter((i) => !i.media?.imageUrl || i.media.imageUrl === PLACEHOLDER_PUBLIC_PATH).length;

  const imgBroken = items.filter((i) => {
    const p = i.media?.imageUrl;
    if (!p || p === PLACEHOLDER_PUBLIC_PATH) return false;
    const fp = path.join(publicDir, p.replace(/^\//, ""));
    return false; // we will check existence asynchronously later; this is placeholder
  }).length;

  const clustersOneSource = stories.filter((c) => {
    const ids = c.itemIds ?? [];
    const sources = new Set(ids.map((id) => items.find((it) => it.id === id)?.sourceId).filter(Boolean));
    return sources.size <= 1;
  }).length;

  const clustersLT3 = stories.filter((c) => (c.itemIds ?? []).length < 3).length;
  const shortText = items.filter((i) => (i.extractedText ?? "").trim().length < 500).length;
  const titleOnly = items.filter((i) => {
    const sum = (i.summary ?? "").trim();
    const title = (i.title ?? "").trim();
    if (!sum) return true;
    if (sum.toLowerCase() === title.toLowerCase()) return true;
    return sum.length < 80;
  }).length;

  const toPct = (n: number, d: number) => (d ? (n / d) * 100 : 0);

  return {
    items: items.length,
    stories: stories.length,
    imgMissing,
    imgMissingPct: toPct(imgMissing, items.length),
    imgBroken,
    imgBrokenPct: toPct(imgBroken, items.length),
    clustersOneSource,
    clustersOneSourcePct: toPct(clustersOneSource, stories.length),
    clustersLT3,
    clustersLT3Pct: toPct(clustersLT3, stories.length),
    shortText,
    shortTextPct: toPct(shortText, items.length),
    titleOnly,
    titleOnlyPct: toPct(titleOnly, items.length),
  };
}

export async function auditDataset(dataset: DatasetFile, publicDir: string): Promise<{ metrics: AuditMetrics; invalid: boolean }> {
  const metrics = computeAudit(dataset, publicDir);

  // async check for broken images (file missing)
  let broken = 0;
  for (const item of dataset.items ?? []) {
    const p = item.media?.imageUrl;
    if (!p || p === PLACEHOLDER_PUBLIC_PATH) continue;
    const fp = path.join(publicDir, p.replace(/^\//, ""));
    try {
      await fs.access(fp);
    } catch {
      broken++;
    }
  }
  metrics.imgBroken = broken;
  metrics.imgBrokenPct = metrics.items ? (broken / metrics.items) * 100 : 0;

  const thresholds = [
    metrics.imgMissingPct,
    metrics.imgBrokenPct,
    metrics.clustersOneSourcePct,
    metrics.clustersLT3Pct,
    metrics.shortTextPct,
    metrics.titleOnlyPct,
  ];
  const invalid = thresholds.some((v) => v > 20);

  return { metrics, invalid };
}
