# CerebroNews

This repository contains the CerebroNews app and supporting scripts.
The web app lives in the `web/` directory.

## Run the web app

Repository layout (where to put `.env`):

```
CerebrosNews/
  README.md
  web/
    .env  <-- create this file here
    package.json
    src/
    ...
```

Quick start:

```bash
cd web
```

Create `web/.env` with your OpenAI API key (copy-paste and replace the value):

```env
OPENAI_API_KEY=sk-your-openai-api-key
```

Install and run onboarding:

```bash
npm install
npm run onboarding
```

Open http://localhost:3000 in your browser.

## AI tools used

- Cursor for coding, planning, and debugging (using different models depending on task complexity)
- ChatGPT for ideation, brainstorming, and as my personal UI/UX thought partner

## What I'd build with more time

- Personalization that actually learns over time  
  Right now personalization is heuristics-based. With more time, I’d make it learn from user behavior across sessions (what you read, skip, scroll, or explore).
- Stronger claim verification and source reliability  
  Trust is core to how I consume information. I’d separate high-signal vs low-signal sources and weigh them differently — currently all citations are treated equally.
- Better multi-perspective story grouping  
  News shouldn’t be consumed from a single author or lens. I’d improve clustering so each story shows multiple narratives and biases together in one place.
- Real-time social signal ingestion  
  A lot of important information appears first on social platforms. I’d add a pipeline to ingest and filter high-signal posts (e.g. Twitter) before elevating them into the feed.
- System-wide guardrails and evaluation  
  Add stronger guardrails and internal checks so summaries, verification, and clustering stay reliable as the system scales.

## Scripts (optional)

Dataset and curation scripts are under `web/scripts/`.
See `web/README.md` for more details.
