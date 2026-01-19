import fs from "fs/promises";
import path from "path";
import imageSize from "image-size";
import { FetchOptions, fetchHeadHtml, fetchWithRetry } from "./fetch";

export const IMAGE_MAX_BYTES = 600_000;
export const IMAGE_MAX_COUNT = 4000;
export const IMAGE_MIN_WIDTH = 300;

export const PLACEHOLDER_PUBLIC_PATH = "/data/images/placeholder.svg";

function extFromContentType(ct: string | null): string {
  if (!ct) return "bin";
  const lower = ct.toLowerCase();
  if (lower.includes("image/jpeg")) return "jpg";
  if (lower.includes("image/jpg")) return "jpg";
  if (lower.includes("image/png")) return "png";
  if (lower.includes("image/webp")) return "webp";
  if (lower.includes("image/gif")) return "gif";
  if (lower.includes("image/svg")) return "svg";
  return "bin";
}

function parseMetaImage(html: string): string | null {
  const lower = html.toLowerCase();
  // Prefer og:image then twitter:image
  const ogIdx = lower.indexOf('property="og:image"');
  if (ogIdx !== -1) {
    const snippet = html.slice(Math.max(0, ogIdx - 400), ogIdx + 400);
    const m = snippet.match(/content=["']([^"']+)["']/i);
    if (m?.[1]) return m[1];
  }
  const twIdx = lower.indexOf('name="twitter:image"');
  if (twIdx !== -1) {
    const snippet = html.slice(Math.max(0, twIdx - 400), twIdx + 400);
    const m = snippet.match(/content=["']([^"']+)["']/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

export async function resolveOgImageUrl(articleUrl: string, opts: FetchOptions): Promise<string | null> {
  try {
    const headHtml = await fetchHeadHtml(articleUrl, opts, 64_000);
    const img = parseMetaImage(headHtml);
    return img ? img.trim() : null;
  } catch {
    return null;
  }
}

async function downloadImageBuffer(url: string, opts: FetchOptions): Promise<{ buf: Buffer; ext: string } | null> {
  const res = await fetchWithRetry(
    url,
    { method: "GET", redirect: "follow", headers: { accept: "image/*,*/*;q=0.8" } },
    opts
  );

  if (!res.ok) return null;
  const ct = res.headers.get("content-type");
  if (ct && !ct.toLowerCase().startsWith("image/")) return null;

  const cl = res.headers.get("content-length");
  if (cl) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > IMAGE_MAX_BYTES) return null;
  }

  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > IMAGE_MAX_BYTES) return null;
      chunks.push(value);
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (buf.byteLength === 0) return null;
  return { buf, ext: extFromContentType(ct) };
}

export async function ensureImagesDir(publicDir: string): Promise<string> {
  const imagesDir = path.join(publicDir, "data", "images");
  await fs.mkdir(imagesDir, { recursive: true });
  return imagesDir;
}

export async function ensurePlaceholderImage(publicDir: string, imagesDir: string): Promise<void> {
  const src = path.join(publicDir, "globe.svg");
  const dest = path.join(imagesDir, "placeholder.svg");
  try {
    await fs.access(dest);
  } catch {
    try {
      await fs.copyFile(src, dest);
    } catch {
      // If copy fails, the placeholder path will still be referenced; UI should handle missing image gracefully.
    }
  }
}

export interface ImageStore {
  imagesDir: string;
  // maps remote URL -> local public path
  downloaded: Map<string, string>;
  downloadedCount: number;
}

export async function storeImageForItem(params: {
  itemId: string;
  candidateImageUrls: Array<string | null | undefined>;
  articleUrl: string;
  opts: FetchOptions;
  store: ImageStore;
  fallbackImageUrl?: string | null;
}): Promise<string> {
  if (params.store.downloadedCount >= IMAGE_MAX_COUNT) return PLACEHOLDER_PUBLIC_PATH;

  const candidates: string[] = [];
  for (const u of params.candidateImageUrls) {
    if (typeof u === "string" && u.trim()) candidates.push(u.trim());
  }

  const tryDownloadList = async (list: string[]): Promise<string | null> => {
    for (const remote of list) {
      const cached = params.store.downloaded.get(remote);
      if (cached) return cached;

      try {
        const dl = await downloadImageBuffer(remote, params.opts);
        if (!dl) continue;

        const filename = `${params.itemId}.${dl.ext}`;
        const filePath = path.join(params.store.imagesDir, filename);

        try {
          const dims = imageSize(dl.buf);
          if (!dims || typeof dims.width !== "number" || dims.width < IMAGE_MIN_WIDTH) {
            continue;
          }
        } catch {
          continue;
        }
        await fs.writeFile(filePath, dl.buf);

        const publicPath = `/data/images/${filename}`;
        params.store.downloaded.set(remote, publicPath);
        params.store.downloadedCount += 1;
        return publicPath;
      } catch {
        continue;
      }
    }
    return null;
  };

  // 1) Try RSS/media candidates first (if any)
  const fromRss = await tryDownloadList(candidates);
  if (fromRss) return fromRss;

  // 2) Always fall back to OG/Twitter image (even if RSS candidate existed but failed size/type)
  const og = await resolveOgImageUrl(params.articleUrl, params.opts);
  if (og) {
    const fromOg = await tryDownloadList([og]);
    if (fromOg) return fromOg;
  }

  // 3) Placeholder
  if (params.fallbackImageUrl && params.fallbackImageUrl.trim()) {
    return params.fallbackImageUrl.trim();
  }
  return PLACEHOLDER_PUBLIC_PATH;
}

