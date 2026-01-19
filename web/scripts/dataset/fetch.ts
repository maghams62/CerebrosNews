export interface FetchOptions {
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  concurrency: number;
  userAgent: string;
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  timeoutMs: 10_000,
  retries: 2,
  retryBaseDelayMs: 500,
  concurrency: 6,
  userAgent: "CerebrosNewsDataset/0.1 (dataset-generator)",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  const factor = 0.7 + Math.random() * 0.6;
  return Math.floor(ms * factor);
}

export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  }

  return { run };
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchOptions
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "*/*",
          "user-agent": opts.userAgent,
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        // Retry 5xx, and some 429.
        if ((res.status >= 500 && res.status <= 599) || res.status === 429) {
          throw new Error(`HTTP ${res.status} ${url}`);
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === opts.retries) break;
      const delay = jitter(opts.retryBaseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Fetch failed: ${url}`);
}

export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
      },
    },
    opts
  );
  return await res.text();
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
    opts
  );
  return (await res.json()) as T;
}

export async function fetchHeadHtml(url: string, opts: FetchOptions, maxBytes = 64_000): Promise<string> {
  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    },
    opts
  );

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) {
    // Still try to read a small chunk; some sites mislabel.
  }

  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) break;
    }
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const text = buf.toString("utf8");
  // Head should appear early; trim to reduce parse cost.
  const headEnd = text.toLowerCase().indexOf("</head>");
  if (headEnd !== -1) return text.slice(0, headEnd + "</head>".length);
  return text;
}

