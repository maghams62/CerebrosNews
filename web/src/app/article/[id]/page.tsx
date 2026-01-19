import Link from "next/link";
import { notFound } from "next/navigation";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { FocusedViewerFrame } from "@/components/FocusedViewerFrame";
import { readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { readOfflineStoryGroups } from "@/lib/dataset/offlineStoryGroups";
import { getFeed } from "@/lib/feed/getFeed";
import { feedItemToStory } from "@/lib/feed/toStory";
import { mockInsightBundle } from "@/lib/insights/mockInsightBundle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bulletsFromMarkdown(markdown: string | undefined | null): string[] {
  if (!markdown) return [];
  const bullets = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^-+\s*/, "").trim())
    .filter((b) => b && b.toLowerCase() !== "not specified." && !b.toLowerCase().includes("not specified"));
  if (bullets.length) return bullets;
  // Fallback: if it's not markdown bullets, treat as one-line summary.
  const single = markdown.replace(/\s+/g, " ").trim();
  if (!single) return [];
  if (single.toLowerCase().includes("not specified")) return [];
  return [single];
}

function chunkText(text: string, targetLen = 700): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // Prefer sentence boundaries; fall back to fixed chunks.
  const sentences = clean.split(/(?<=[.!?])\s+/g).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (!cur) cur = s;
    else if (cur.length + 1 + s.length <= targetLen) cur = `${cur} ${s}`;
    else {
      out.push(cur);
      cur = s;
    }
  }
  if (cur) out.push(cur);
  // If the text had no sentence breaks, we may end up with a single huge paragraph; chunk it.
  if (out.length === 1 && out[0]!.length > targetLen * 2) {
    const big = out[0]!;
    const fixed: string[] = [];
    for (let i = 0; i < big.length; i += targetLen) fixed.push(big.slice(i, i + targetLen));
    return fixed;
  }
  return out;
}

async function tryReadability(url: string): Promise<{ text: string | null; byline: string | null }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!res.ok) return { text: null, byline: null };
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(dom.window.document).parse();
    const text = parsed?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const trimmed = text && text.length ? text.slice(0, 20_000) : null;
    const byline = parsed?.byline?.trim?.() ?? null;
    return { text: trimmed, byline };
  } catch {
    return { text: null, byline: null };
  } finally {
    clearTimeout(id);
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const offline = await readOfflineDataset();
  const storyGroups = await readOfflineStoryGroups();
  const offlineItem = offline?.items?.find((f) => f.id === id) ?? null;
  const group = storyGroups?.find((g) => g.perspectives?.some((p) => p.id === id)) ?? null;

  if (offlineItem) {
    const sourceName = offline?.sources?.find((s) => s.id === offlineItem.sourceId)?.name ?? offlineItem.sourceId;
    const imageUrl = offlineItem.media?.imageUrl ?? "/globe.svg";
    const summaryBullets = bulletsFromMarkdown(offlineItem.summary);
    const storedText = offlineItem.extractedText ?? "";
    const hasStoredText = Boolean(storedText && storedText.trim().length > 1200);
    const fallbackText = offlineItem.description ?? "";
    const contentUrl =
      offlineItem.canonicalUrl && offlineItem.canonicalUrl !== offlineItem.url ? offlineItem.canonicalUrl : offlineItem.url;
    const shouldFetch = !hasStoredText && Boolean(contentUrl);
    const fetched = shouldFetch ? await tryReadability(contentUrl) : { text: null, byline: null };
    const fullText = hasStoredText ? storedText : fetched.text ?? fallbackText;
    const paragraphs = chunkText(fullText, 750);
    const byline = offlineItem.author ?? fetched.byline ?? null;

    return (
      <main>
        <FocusedViewerFrame>
          <header className="border-b border-slate-200 bg-white px-7 py-3">
            <div className="flex items-center justify-between gap-6">
              <Link className="text-xs font-semibold text-indigo-600 hover:text-indigo-700" href="/feed">
                ← Back to feed
              </Link>
              <div className="text-xs text-slate-500 truncate">
                <span className="font-semibold text-slate-700">{sourceName}</span>
                <span className="text-slate-400"> • </span>
                <span>{offlineItem.publishedAt}</span>
              </div>
            </div>
          </header>

          <div className="h-[calc(100%-44px)] overflow-hidden">
            <div className="h-full overflow-y-auto px-7 py-6">
              <div className="mx-auto max-w-[820px]">
                <h1 className="text-3xl font-bold text-slate-900 leading-tight">{offlineItem.title}</h1>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {byline ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {byline}
                    </span>
                  ) : null}
                  {offlineItem.domain ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {offlineItem.domain}
                    </span>
                  ) : null}
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-50">
                  <img src={imageUrl} alt={offlineItem.title} className="h-64 w-full object-cover" />
                </div>

                {summaryBullets.length ? (
                  <div className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 p-5">
                    <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Summary</div>
                    <ul className="mt-3 list-disc pl-5 space-y-2 text-base text-slate-800 leading-relaxed">
                      {summaryBullets.slice(0, 6).map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 p-5">
                  <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Full article</div>
                  <div className="mt-3 space-y-4 text-base text-slate-800 leading-relaxed">
                    {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>We could not extract the full text for this article.</p>}
                    {!hasStoredText && !fetched.text ? (
                      <p className="text-sm text-slate-600">
                        Some sites block extraction; if this looks incomplete, open the original source below.
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Demo note: cluster analysis can be misleading when clusters are looser. Prefer per-article summary + full text above. */}

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-5 py-4">
                  <div className="text-sm text-slate-700">
                    Prefer the original? <span className="text-slate-500">Open the source page in a new tab.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {offlineItem.canonicalUrl && offlineItem.canonicalUrl !== offlineItem.url ? (
                      <a
                        className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
                        href={offlineItem.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open discussion ↗
                      </a>
                    ) : null}
                    <a
                      className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      href={contentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original source ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FocusedViewerFrame>
      </main>
    );
  }

  const feed = await getFeed();
  const item = feed.find((f) => f.id === id) ?? null;
  if (!item) return notFound();

  const story = feedItemToStory(item);
  const insights = mockInsightBundle(item);

  return (
    <main>
      <FocusedViewerFrame>
        <header className="border-b border-slate-200 bg-white px-7 py-3">
          <div className="flex items-center justify-between gap-6">
            <Link className="text-xs font-semibold text-indigo-600 hover:text-indigo-700" href="/feed">
              ← Back to feed
            </Link>
            <div className="text-xs text-slate-500 truncate">
              <span className="font-semibold text-slate-700">{story.sourceName}</span>
              <span className="text-slate-400"> • </span>
              <span>{story.publishedAt}</span>
            </div>
          </div>
        </header>

        <div className="h-[calc(100%-44px)] overflow-hidden">
          <div className="h-full overflow-y-auto px-7 py-6">
            <div className="mx-auto max-w-[820px]">
              <h1 className="text-3xl font-bold text-slate-900 leading-tight">{story.title}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {insights.speculationStatus}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  Evidence: {insights.evidenceStrength}
                </span>
              </div>

              <div className="mt-6 space-y-4 text-base text-slate-800 leading-relaxed">
                <p>{story.fullText || story.summary}</p>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-5 py-4">
                <div className="text-sm text-slate-700">
                  Prefer the original?{" "}
                  <span className="text-slate-500">Open the source page in a new tab.</span>
                </div>
                <a
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  href={story.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original source ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </FocusedViewerFrame>
    </main>
  );
}

