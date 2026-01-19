# CerebroNews

This repository contains the CerebroNews app and supporting scripts.
The web app lives in the `web/` directory.

## Run the web app

```bash
cd web
```

Create `.env.local` with your OpenAI key:

```env
OPENAI_API_KEY=your_key_here
```

Then copy it to `.env`:

```bash
cp .env.local .env
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
