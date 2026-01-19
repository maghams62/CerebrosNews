# CerebroNews

This repository contains the CerebroNews web app (Next.js) plus dataset utilities used for building and enriching the feed.

## Components at a Glance

- ENV (keys): `.env.local` and `.env`
  - OpenAI key for the ask flow: `OPENAI_API_KEY`.
- Data scripts (build/enrich): `scripts/`
  - Dataset builder, tagging, trust fields backfill, and story group curation.

## Index
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API](#api)
- [Data and Scripts](#data-and-scripts)
- [Notes](#notes)

## Prerequisites

- Node.js 18+ (or 20+)
- npm

## Setup

Create a `.env.local` file and add your OpenAI key:

```env
OPENAI_API_KEY=your_key_here
```

Then copy it to `.env` using the same key name:

```bash
cp .env.local .env
```

## Quick Start

Run everything from the `web/` directory:

```bash
npm install
npm run dev:onboarding
```

Open http://localhost:3000 in your browser.

## Environment Variables

Example `.env.local` (then copy to `.env`):

```env
OPENAI_API_KEY=your_key_here
```

- `OPENAI_API_KEY`: Enables the ask flow in the feed UI.

## API

- POST `/api/ask`
  - Body: `{ "question": "...", "context": "...", "summary": "..." }`
  - Returns: `{ "answer": "...", "sources": [...] }`

## Data and Scripts

- Build dataset:
  ```bash
  npm run build:dataset
  ```
- Refresh trust fields:
  ```bash
  TRUST_FIELDS_FORCE=true npx tsx scripts/enrichTrustFields.ts
  ```

## Notes

- The feed includes editorial, community, and social signals.
