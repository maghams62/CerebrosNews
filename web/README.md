# Celebrals

Celebrals is a Next.js app for exploring and summarizing news with trust-focused context.

## Quick start

```bash
cp .env.local.example .env.local
```

Or create `.env.local` (or `.env`) and add your OpenAI key:

```bash
OPENAI_API_KEY=your_key_here
```

Install dependencies, build, and run the app:

```bash
npm install
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## What’s in this repo

- `src/app` - Next.js app routes and pages, including the landing page and API routes.
- `src/app/api/ask` - LLM-powered endpoint for question/answer workflows.
- `src/components` - UI components for desktop and mobile story cards.
- `src/lib` - App state, prompt logic, and trust-related helpers.
- `scripts` - Dataset and enrichment scripts for content and trust fields.

## Bluesky connector

Add credentials to your `.env.local` (do not commit secrets):

```
BLUESKY_EMAIL=...
BLUESKY_PASSWORD=...
# Optional
BLUESKY_HANDLE=...
BLUESKY_SERVICE=https://bsky.social
```

Product note: Bluesky is treated as a social signal layer (community reaction + trend discovery), not a primary news source. We prioritize link-centric posts and topic-mapped queries to reduce low-signal chatter.

## Trust fields backfill

Generate or refresh trust fields (framing, what's missing, so what) for every article:

```bash
TRUST_FIELDS_FORCE=true npx tsx scripts/enrichTrustFields.ts
```

Omit `TRUST_FIELDS_FORCE` to only backfill missing/placeholder entries.
