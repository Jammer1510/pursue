# PURSUE.ARCHIVE

PURSUE.ARCHIVE is a public browser for a curated set of 120 UAP-related records. It turns a locally ingested SQLite archive into a static, shareable Next.js site with timeline, map, browse, detail, connections, translation, scoring, and citation-aware AI chat views.

Live site: https://pursue-ten.vercel.app/

## Features

- Timeline view of all ingested records.
- Map view for geocoded event locations.
- Browse table with client-side filtering and MiniSearch search.
- Event detail panels with claims, source links, summaries, tags, anomaly scoring, and concealment scoring.
- Connections view for finding events that share extracted tags.
- English and Chinese UI/content fields where translations are available.
- Static JSON deployment path for Vercel: no runtime database and no production API keys required.
- Optional Gemini-powered chatbot for natural-language queries over the archive, with event citations that deep-link into detail panels.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- SQLite via `better-sqlite3` for local ingest/development
- Static JSON files under `public/data` for deployed reads
- MiniSearch for browser-side Browse search
- Leaflet / React Leaflet for maps
- Gemini API for optional archive chat and local enrichment
- Upstash Redis for optional chat rate limiting

## Data Model

The local ingest pipeline writes records to `data/pursue.db`, which is intentionally gitignored. The static export workflow generates committed JSON files under `public/data`:

- `public/data/summaries.json`
- `public/data/locations.json`
- `public/data/tags.json`
- `public/data/search.json`
- `public/data/events/*.json`

Production reads from those static JSON files. Local development defaults to SQLite unless `NEXT_PUBLIC_DATA_SOURCE=json` is set.

## AI Chatbot

The chat panel lets users ask natural-language questions about the committed archive data. Answers can cite records with clickable event references, so users can inspect the underlying event detail without leaving the current view.

Chat is optional and separate from the static archive. The timeline, map, browse, connections, and event pages work without any production secrets. To enable chat in a deployment, set:

- `GEMINI_API_KEY`: required for `/api/chat`
- `UPSTASH_REDIS_REST_URL`: optional, enables hosted rate limiting
- `UPSTASH_REDIS_REST_TOKEN`: optional, enables hosted rate limiting

If the Gemini key is missing, the archive still builds and serves normally, but chat requests will return a configuration error. The repository includes `.env.example` placeholders only; real `.env` files are gitignored.

## Local Development

Install dependencies:

```bash
npm install
```

Run against the local SQLite database:

```bash
npm run dev
```

Run against the static JSON export, matching the deployed data path:

```bash
NEXT_PUBLIC_DATA_SOURCE=json npm run dev
```

Open http://localhost:3000.

## Data Refresh

The ingest workflow depends on local source data and optional local environment variables. Production does not need those secrets because enriched fields are baked into the generated JSON.

Run ingest and rebuild static JSON:

```bash
npm run refresh
```

Or rebuild static JSON from the existing local SQLite database:

```bash
npm run build:data
```

Commit the regenerated `public/data` files after a data refresh.

## Build and Deploy

Build locally:

```bash
npm run build
```

Vercel settings:

- Framework: Next.js
- Build command: `npm run build`
- Output directory: default
- Environment variables for the core archive: none required
- Environment variables for chat: `GEMINI_API_KEY`; optional `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

On Vercel, `build:data` detects the Vercel environment and uses the committed `public/data` JSON instead of trying to regenerate from the gitignored SQLite database.

## Notes on Data and Sources

The project code is licensed under MIT. The source documents, extracted records, linked URLs, and public-record content may have their own source terms or public-record status. This repository does not claim ownership over original government/public source materials referenced by the dataset.

Automated metadata such as tags, translations, summaries, and scoring fields are included to make the archive easier to browse. They should be treated as research aids, not authoritative determinations.

## License

MIT License. See [LICENSE](LICENSE).
