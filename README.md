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

- Personalization that actually learns over time (behavior-aware, cross-session learning)
- Stronger claim verification and source reliability weighting
- Better multi-perspective story grouping (multiple narratives per story)
- Real-time social signal ingestion and filtering (e.g., Twitter)
- System-wide guardrails and evaluation for reliability at scale

## Scripts (optional)

Dataset and curation scripts are under `web/scripts/`.
See `web/README.md` for more details.
