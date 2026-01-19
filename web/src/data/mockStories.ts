import { Story } from "@/types/story";
import { generateMockPerspectives } from "@/lib/feed/mockPerspectives";

const base = [
  {
    id: "1",
    title: "Startup unveils AI chip aimed at edge devices",
    summary: "New architecture promises lower latency and power use for wearables and cars.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    sourceName: "TechCrunch",
    sourceType: "editorial",
    publishedAt: "2h ago",
    fullText:
      "A stealth startup revealed an AI accelerator optimized for edge inference. The chip targets wearables, autos, and industrial sensors, focusing on low latency and minimal power draw. Early benchmarks show gains over incumbents in constrained environments.",
    tags: [],
  },
  {
    id: "2",
    title: "EV maker expands charging network to rural corridors",
    summary: "Aim is to reduce range anxiety outside major metros with 350kW stations.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Reuters",
    sourceType: "editorial",
    publishedAt: "3h ago",
    fullText:
      "The automaker announced 120 new high-speed chargers across rural routes, partnering with utilities to stabilize load. Analysts say this could accelerate EV adoption beyond cities.",
    tags: [],
  },
  {
    id: "3",
    title: "Major bank pilots programmable money for trade finance",
    summary: "Tokenized deposits tested to automate settlement and compliance.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Bloomberg",
    sourceType: "editorial",
    publishedAt: "4h ago",
    fullText:
      "A global bank ran a pilot using tokenized deposits to streamline cross-border trade finance. Smart rules enforced documentation checks and reduced settlement time from days to hours.",
    tags: [],
  },
  {
    id: "4",
    title: "City to add 200km of protected bike lanes by 2027",
    summary: "Plan targets emissions and congestion; includes equity-focused corridors.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1509099836639-18ba02e2e1ba?auto=format&fit=crop&w=1200&q=80",
    sourceName: "The Guardian",
    sourceType: "editorial",
    publishedAt: "1h ago",
    fullText:
      "Officials approved a multi-year expansion of protected bike lanes, prioritizing neighborhoods with limited transit. Funding mixes municipal bonds and federal grants.",
    tags: [],
  },
  {
    id: "5",
    title: "Researchers map microplastics in remote alpine snow",
    summary: "Findings suggest long-range transport via atmospheric currents.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Nature",
    sourceType: "editorial",
    publishedAt: "5h ago",
    fullText:
      "Scientists sampled high-altitude snowpacks and detected microplastics, indicating airborne distribution. The study raises concerns about ecosystem impacts and human exposure.",
    tags: [],
  },
  {
    id: "6",
    title: "Chipmakers eye 2nm production ramp by 2027",
    summary: "Race tightens as fabs invest in new EUV lines and packaging tech.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Nikkei Asia",
    sourceType: "editorial",
    publishedAt: "6h ago",
    fullText:
      "Leading foundries laid out roadmaps for 2nm volume production, hinging on advanced EUV and backside power delivery. Packaging advances like hybrid bonding are critical to performance gains.",
    tags: [],
  },
  {
    id: "7",
    title: "FDA clears first over-the-counter sleep apnea test",
    summary: "Home kit aims to expand diagnosis beyond sleep labs.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Associated Press",
    sourceType: "editorial",
    publishedAt: "7h ago",
    fullText:
      "The device uses wearable sensors to screen for sleep apnea at home. Clinicians hope it reduces wait times for diagnosis, though follow-up care remains essential.",
    tags: [],
  },
  {
    id: "8",
    title: "Global grain prices ease as harvest outlook improves",
    summary: "Futures dip with favorable weather across key producers.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1472145246862-b24cf25c4a36?auto=format&fit=crop&w=1200&q=80",
    sourceName: "Financial Times",
    sourceType: "editorial",
    publishedAt: "8h ago",
    fullText:
      "Improved weather in major grain belts drove futures lower, easing food inflation worries. Analysts caution that logistics and geopolitical risks remain.",
    tags: [],
  },
  {
    id: "9",
    title: "Satellite internet constellation adds polar coverage",
    summary: "New shells target high-latitude shipping and research routes.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80",
    sourceName: "The Verge",
    sourceType: "editorial",
    publishedAt: "9h ago",
    fullText:
      "The operator launched additional satellites to extend service to polar regions, aiming at maritime and scientific customers. Regulatory approvals are pending in several countries.",
    tags: [],
  },
  {
    id: "10",
    title: "Researchers hit new milestone in quantum error correction",
    summary: "Lower logical error rates achieved with improved surface codes.",
    url: "https://example.com/",
    imageUrl: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
    sourceName: "MIT Technology Review",
    sourceType: "editorial",
    publishedAt: "10h ago",
    fullText:
      "A lab demonstrated reduced logical error rates using refined surface code implementations, a key step toward scalable quantum computers. Hardware stability remains the bottleneck.",
    tags: [],
  },
];

export const mockStories: Story[] = base.map((s) => ({
  ...s,
  perspectives: generateMockPerspectives(s),
}));
