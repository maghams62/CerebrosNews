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

## Scripts (optional)

Dataset and curation scripts are under `web/scripts/`.
See `web/README.md` for more details.
