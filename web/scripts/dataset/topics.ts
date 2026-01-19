import { DatasetTopic } from "./schema";

export const TOPICS: DatasetTopic[] = [
  {
    id: "general",
    label: "General",
    keywords: ["technology", "tech", "software", "hardware", "internet"],
  },
  {
    id: "ai",
    label: "AI",
    keywords: ["ai", "artificial intelligence", "llm", "chatgpt", "openai", "anthropic", "gemini", "machine learning"],
  },
  {
    id: "startups_vc",
    label: "Startups & VC",
    keywords: ["startup", "seed", "series a", "series b", "funding", "venture", "vc", "valuation", "acquired"],
  },
  {
    id: "frontend",
    label: "Frontend",
    keywords: ["react", "next.js", "nextjs", "frontend", "ui", "css", "tailwind", "typescript", "javascript"],
  },
  {
    id: "backend",
    label: "Backend & Infra",
    keywords: ["kubernetes", "k8s", "postgres", "database", "backend", "infra", "devops", "docker", "microservices"],
  },
  {
    id: "devtools",
    label: "Developer Tools",
    keywords: ["devtools", "developer tools", "sdk", "cli", "open source", "github", "release", "launch"],
  },
  {
    id: "security",
    label: "Security",
    keywords: ["security", "breach", "vulnerability", "cve", "ransomware", "phishing", "zero-day", "exploit"],
  },
  {
    id: "hardware_gpu",
    label: "Hardware & GPUs",
    keywords: ["gpu", "nvidia", "amd", "intel", "semiconductor", "chip", "foundry", "euv", "supply chain"],
  },
  {
    id: "robotics",
    label: "Robotics",
    keywords: ["robot", "robotics", "humanoid", "automation", "warehouse robot", "drone", "autonomous"],
  },
  {
    id: "policy",
    label: "Policy",
    keywords: ["regulation", "policy", "law", "antitrust", "congress", "eu", "gdpr", "ai act"],
  },
  {
    id: "data",
    label: "Data",
    keywords: ["data", "privacy", "dataset", "analytics", "telemetry", "tracking", "observability", "logging"],
  },
];

