type TopicConfig = {
  query: string;
  keywords: string[];
};

const TOPIC_QUERY_MAP: Record<string, TopicConfig> = {
  ai: {
    query: '("llm" OR "agent" OR "openai" OR "anthropic" OR "gpt" OR "foundation model")',
    keywords: ["llm", "agent", "openai", "anthropic", "gpt", "foundation model", "alignment", "inference"],
  },
  startups: {
    query: '("startup" OR "founder" OR "seed round" OR "demo day" OR "venture")',
    keywords: ["startup", "founder", "seed", "series a", "demo day", "venture", "vc", "incubator"],
  },
  frontend: {
    query: '("react" OR "next.js" OR "vite" OR "typescript ui" OR "css")',
    keywords: ["react", "next.js", "vite", "typescript", "css", "tailwind", "frontend"],
  },
  backend: {
    query: '("api" OR "backend" OR "database" OR "kubernetes" OR "microservices")',
    keywords: ["api", "backend", "database", "postgres", "kubernetes", "microservices", "grpc"],
  },
  devtools: {
    query: '("developer tools" OR "cli" OR "ide" OR "observability" OR "ci")',
    keywords: ["devtools", "cli", "ide", "observability", "ci", "cd", "debugger"],
  },
  security: {
    query: '("cve" OR "breach" OR "vuln" OR "exploit" OR "zero day")',
    keywords: ["cve", "breach", "vuln", "exploit", "zero-day", "security"],
  },
  hardware: {
    query: '("gpu" OR "nvidia" OR "cuda" OR "chip" OR "semiconductor")',
    keywords: ["gpu", "nvidia", "cuda", "chip", "semiconductor", "hardware", "accelerator"],
  },
  robotics: {
    query: '("robotics" OR "robot" OR "automation" OR "humanoid")',
    keywords: ["robotics", "robot", "automation", "humanoid", "actuator"],
  },
  data: {
    query: '("data" OR "mlops" OR "warehouse" OR "vector db" OR "analytics")',
    keywords: ["data", "mlops", "warehouse", "vector db", "analytics", "etl"],
  },
  policy: {
    query: '("regulation" OR "policy" OR "ai act" OR "antitrust" OR "privacy law")',
    keywords: ["regulation", "policy", "ai act", "antitrust", "privacy law", "compliance"],
  },
  design: {
    query: '("design system" OR "ux" OR "product design" OR "typography")',
    keywords: ["design system", "ux", "product design", "typography", "interaction"],
  },
  product: {
    query: '("product" OR "roadmap" OR "growth" OR "retention" OR "metrics")',
    keywords: ["product", "roadmap", "growth", "retention", "metrics", "pm"],
  },
};

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

function configForTopic(topic: string): TopicConfig {
  const key = normalizeTopic(topic);
  const mapped = TOPIC_QUERY_MAP[key];
  if (mapped) return mapped;
  return {
    query: `"${topic}"`,
    keywords: [topic],
  };
}

export function buildTopicQueries(topics: string[]): Array<{ topic: string; query: string; keywords: string[] }> {
  const uniq = Array.from(new Set(topics.map((t) => t.trim()).filter(Boolean)));
  return uniq.map((topic) => {
    const cfg = configForTopic(topic);
    return { topic, query: cfg.query, keywords: cfg.keywords };
  });
}

export function matchTopics(text: string, topics: string[]): string[] {
  if (!topics.length) return [];
  const lower = text.toLowerCase();
  const matches: string[] = [];
  const queries = buildTopicQueries(topics);
  for (const q of queries) {
    const hit = q.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hit) matches.push(q.topic);
  }
  return matches;
}

export function topicKey(topics: string[]): string {
  return Array.from(new Set(topics.map((t) => normalizeTopic(t)).filter(Boolean))).sort().join("|") || "all";
}
