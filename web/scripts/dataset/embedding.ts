import { DatasetItem } from "./schema";

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function embeddingTextForItem(item: DatasetItem): string {
  const body = (item.extractedText ?? "").slice(0, 1200);
  const parts = [item.title, item.description ?? item.summary, body]
    .filter(Boolean)
    .map((p) => cleanText(String(p)));
  const merged = parts.join("\n");
  return merged.slice(0, 4000);
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for embeddings.");
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embeddings failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.data.map((d) => d.embedding);
}

export async function embedItems(items: DatasetItem[], batchSize = 16): Promise<void> {
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const maxRetries = 3;

  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const inputs = slice.map(embeddingTextForItem);

    let attempt = 0;
    while (true) {
      try {
        const vectors = await fetchEmbeddings(inputs);
        vectors.forEach((vec, idx) => {
          slice[idx]!.embedding = vec;
        });
        break;
      } catch (err) {
        attempt += 1;
        const msg = err instanceof Error ? err.message : String(err);
        const backoffMs = Math.min(2000 * attempt, 6000);
        console.warn(`Embedding batch ${i / batchSize + 1} failed (attempt ${attempt}): ${msg}`);
        if (attempt >= maxRetries) {
          throw err;
        }
        await sleep(backoffMs);
      }
    }
  }
}
