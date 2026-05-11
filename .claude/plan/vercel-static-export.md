# Plan: Vercel Free-Tier Deploy via Static JSON Export

## Task Type
- [x] Migration (build pipeline + data layer) — no new product features

## User Request (verbatim)
> "good but save this plan we still a bit of fix to do before we will do it on vercle"
> — and earlier: "rn is our app shareable to friends etc? by using vercel free tier"

Goal: make pursue-webapp deployable on Vercel Hobby (free) tier so the user can share it with friends. Read-only browse of 120 pre-ingested UAP events. No runtime Gemini calls (translation/tags/bust/cover-up all baked in at local ingest time).

**Status**: deferred until Sprints 1-6 are committed and smoke-tested. Sprint 7 stays parked here until the user says go.

---

## Why the current build won't deploy

Diagnosed against the repo state at end of Sprint 6:

1. **`better-sqlite3` is a native node module.** Vercel serverless functions run on Linux x64; even when bundling works, the read-only Lambda filesystem and the WAL journaling make file-based SQLite impractical. `getDb()` would crash on cold start.
2. **`data/pursue.db` is gitignored** — it's a local artifact and wouldn't be present in the deployment.
3. **API routes call `getDb()` at request time** — `/api/events`, `/api/events/[id]`, `/api/connections`. All would break.
4. **FTS5 search** in Browse uses SQLite's full-text engine; not portable.

What's already fine for deploy:
- ✓ No Gemini calls at runtime — translation/tags/cover-up/bust are written at local ingest time.
- ✓ No PDF/image hosting needed — events reference external `source_url`.

---

## Recommended approach: static-export migration

Build the DB once locally, dump it to static JSON, commit those files, deploy. Zero runtime DB, zero API cost.

### File-by-file plan

| Step | File | Operation | What |
|---|---|---|---|
| 1 | `scripts/build-static.ts` | Create | CLI that reads `data/pursue.db` via the same `getDb()` helper, then writes JSON files under `public/data/`. Idempotent. |
| 2 | `public/data/summaries.json` | Generated | Array of lightweight per-event records: `id, folder_name, title, title_zh, agency, incident_date(_min/_max), incident_location, incident_location_zh, document_type, bust_score, cover_up_score, latitude, longitude, source_url`. Mirrors `EventSummary` shape. ~50KB for 120 events. |
| 3 | `public/data/locations.json` | Generated | All `event_locations` rows for the map. ~30KB. |
| 4 | `public/data/tags.json` | Generated | Output of `getTagAggregates()` — `[{category, tag, count}]`. ~5KB. |
| 5 | `public/data/events/{id}.json` | Generated (×120) | One file per event: full `EventRecord` shape including `full_text`, `claims`, `sensors`, `witnesses`, `bust_explanations`, `cover_up_indicators`, `tags`, plus every `_zh` array. ~20-40KB each. |
| 6 | `src/lib/data-source.ts` | Create | Single abstraction over reads. Two modes selected by `process.env.NEXT_PUBLIC_DATA_SOURCE` (or `process.env.VERCEL`):<br>• **`"json"` mode**: imports the static files via `fs.readFileSync` at module load (server) or `fetch("/data/...json")` (client).<br>• **`"sqlite"` mode (local dev default)**: keeps using `getDb()` so iterative ingest is still fast. |
| 7 | `src/lib/queries.ts` | Refactor | Replace each `getDb().prepare(...).all()` with a `dataSource.summaries() / .eventById(id) / .tagAggregates() / .eventsByTagIntersection(tags)` call. Function signatures and return types unchanged → no caller updates needed. |
| 8 | `src/app/api/events/route.ts`<br>`src/app/api/events/[id]/route.ts`<br>`src/app/api/connections/route.ts` | Keep, swap source | Routes still respond, but their handlers now read from `data-source.ts` (which reads JSON in prod). Client code unchanged. Alternative: delete the routes and have client components fetch the static JSON directly — keep API routes for now to minimize blast radius. |
| 9 | `src/components/browse-table.tsx` (or new `src/lib/search.ts`) | Refactor search | FTS5 search → client-side MiniSearch index built from `summaries.json` on page mount. ~9KB gzip lib. Index fields: `title`, `summary`, `incident_location`, `bust_reasoning`. For 120 docs, query latency is sub-ms. The existing `?search=` URL param keeps working — Browse just filters locally instead of round-tripping to the server. |
| 10 | `package.json` | Add scripts | `"build:data": "tsx scripts/build-static.ts"`<br>`"prebuild": "npm run build:data"`<br>`"refresh": "npm run ingest && npm run build:data"` (one-shot for re-ingest workflow) |
| 11 | `.gitignore` | Adjust | Keep `data/pursue.db` ignored. Make sure `public/data/` is NOT ignored — those files are deployed. |
| 12 | git | Commit JSON | Commit `public/data/*.json` and `public/data/events/*.json`. Re-ingest cadence: run locally → JSON regenerates → `git commit -am "data refresh: <date>"` → push → Vercel auto-deploys. |
| 13 | `next.config.ts` | Optional | Add `output: "export"` if we drop API routes; otherwise leave as-is and let Vercel run the (tiny) Node runtime. Hobby tier covers both. |
| 14 | Vercel onboarding | One-time | Connect GitHub repo → Vercel dashboard → no env vars needed (no Gemini key on server side, no Turso URL, nothing). |

### Pseudo-code for `scripts/build-static.ts`

```ts
// Reuses src/lib/queries.ts directly when DATA_SOURCE is forced to sqlite.
import fs from "node:fs";
import path from "node:path";
import {
  getAllEventSummaries,
  getAllEventLocations,
  getTagAggregates,
  getEventById,
} from "../src/lib/queries";

const OUT = path.join(process.cwd(), "public", "data");

function writeJson(rel: string, data: unknown) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data));
}

const summaries = getAllEventSummaries();
writeJson("summaries.json", summaries);
writeJson("locations.json", getAllEventLocations());
writeJson("tags.json", getTagAggregates());
for (const s of summaries) {
  writeJson(`events/${s.id}.json`, getEventById(s.id));
}
console.log(`[build-static] wrote ${summaries.length} event files + 3 indexes to ${OUT}`);
```

### Pseudo-code for `src/lib/data-source.ts`

```ts
const MODE = process.env.NEXT_PUBLIC_DATA_SOURCE
  || (process.env.VERCEL ? "json" : "sqlite");

if (MODE === "json") {
  // Server: read files at module init for fastest access
  const summaries = JSON.parse(fs.readFileSync("public/data/summaries.json", "utf8"));
  // ...etc, also cache eventById results lazily by reading public/data/events/{id}.json
  export function allSummaries() { return summaries; }
  // ...
} else {
  // Pass-through to existing getDb() queries
  import * as q from "./queries-sqlite";  // (rename the existing queries.ts internals)
  export const { allSummaries, ... } = q;
}
```

Trade-off: bundling 120 event JSON files into the build adds ~3-5 MB. Acceptable. They live in `public/`, served as static assets, cached by CDN.

---

## Cost on Hobby tier (free)

| Resource | Need | Free limit | Headroom |
|---|---|---|---|
| Storage (deploy artifacts) | ~5-8 MB JSON | unlimited | ∞ |
| Bandwidth | ~50KB initial + ~30KB per detail open | 100GB/mo | ~20-30k monthly page views before cap |
| Build minutes | ~90s per push | unlimited (Hobby) | ∞ |
| Serverless invocations | only if we keep API routes | 100K/day | plenty for a friend-share site |
| Edge requests | static files | unlimited | ∞ |
| Env vars | none required | 100 | ∞ |

No paid tier needed for a personal share-with-friends deploy.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `full_text` per event makes `events/{id}.json` heavy (some FBI archive sections are 30KB markdown after ingest truncation) | Already truncated to `TRUNCATE_CHARS=30_000` in ingest. If still too big, ship `full_text` in a separate `events/{id}-fulltext.md` lazy-fetched only when user clicks "Full document text". |
| MiniSearch quality drops vs FTS5 | With only 120 docs and a small corpus, fuzzy + prefix scoring is fine. Confirm by running the existing test queries (e.g. "Roswell", "FLIR", "Aguadilla") side-by-side before merge. |
| `git diff` on JSON is noisy after re-ingest | Use a separate commit each refresh with the message `data refresh: YYYY-MM-DD`. Don't watch the diffs. |
| Client-side filter on Browse becomes slow if event count grows beyond a few thousand | Not a real concern for this dataset. If it ever ships >5000 events, switch to server-rendered filtering with ISR. |
| Re-ingest workflow now needs a manual commit step | `npm run refresh` chains it; one command from clean DB to pushed commit. |
| Cookie-backed locale (`pursue-locale`) doesn't fly with `output: "export"` SSR | Already client-set via `document.cookie`. The server-side read in `RootLayout` becomes a build-time read which falls back to `DEFAULT_LOCALE=en`. Client hydration corrects it on first paint via the `useEffect` in `LocaleProvider`. Acceptable. |
| Map tile loads count against bandwidth | Tiles come from `basemaps.cartocdn.com` (CartoDB), not from us. Free for our usage. |

---

## Pre-flight checklist before triggering this sprint

- [ ] All re-ingest runs from Sprint 3 are done — DB has 120 events with `cover_up_score`/`title_zh` filled (where applicable).
- [ ] Sprints 1-6 committed to git on the working branch.
- [ ] Visual smoke pass on local dev: `/`, `/map`, `/browse`, `/connections` all work in EN + 中文.
- [ ] No console errors or hydration warnings in browser devtools.
- [ ] User has a GitHub repo to push pursue-webapp to (currently this is a local-only project; a `git remote add origin ...` step will be needed).
- [ ] Confirm `.env` (with `GEMINI_API_KEY`) is gitignored. Quick check: `git check-ignore .env` should print `.env`.

---

## Implementation order (when we run this)

**Sprint 7 — Vercel static export — ~3-4h total**
1. Write `scripts/build-static.ts`. Run it locally. Inspect `public/data/` output (~30 sec).
2. Add MiniSearch dependency: `npm install minisearch`.
3. Create `src/lib/data-source.ts` with both modes. Default to sqlite locally, json in production.
4. Refactor `src/lib/queries.ts` to delegate through `data-source.ts`. Type-check.
5. Refactor Browse search to use MiniSearch on the client. Type-check.
6. Local smoke: `NEXT_PUBLIC_DATA_SOURCE=json npm run dev` — verify every page works against the static JSON, not the DB.
7. Try `npm run build` locally → confirm build artifacts include `public/data/*` and the build itself succeeds.
8. Commit `public/data/*.json`, the new scripts, and the refactors.
9. Push to GitHub (assumes `git remote add origin ...` is done first).
10. Vercel: import the repo, deploy. No env vars. ~90s build.
11. Smoke-test the deployed URL on a friend's network. Confirm map, detail panel, connections, language toggle all behave.
12. Share the URL.

---

## Alternative (not recommended): Turso libSQL

If for some reason static export is undesirable, the runtime-DB alternative is **Turso** (libSQL):

- Drop-in replacement for `better-sqlite3` at the protocol level.
- Free tier: 8 GB storage, 1 billion row reads/month.
- Migration: `sqlite3 data/pursue.db .dump | turso db shell <name>` (or use their CLI).
- Code change: swap `better-sqlite3` for `@libsql/client` in `src/lib/db.ts`. Most queries work identically; FTS5 is supported.
- Adds: a server-side env var (`TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`), network roundtrip per query (cold ~50ms, warm <10ms).

Not recommended because:
- A read-only browser of 120 events doesn't need a runtime database.
- Adds operational dependencies (a hosted service that could change pricing).
- Static export is simpler, faster (zero query roundtrip), and free forever.

But keep this in pocket as Plan B if static export hits an unforeseen blocker.

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `n/a` — single-developer plan, no multi-model analysis
- GEMINI_SESSION: `n/a`

---

## File checklist (all touches when this sprint runs)

```
scripts/build-static.ts                     # NEW
src/lib/data-source.ts                      # NEW — abstraction over sqlite vs json
src/lib/queries.ts                          # refactor — delegate through data-source
src/lib/queries-sqlite.ts                   # rename of current queries internals (optional, depends on refactor shape)
src/lib/search.ts                           # NEW — MiniSearch index for Browse + any FTS callers
src/components/browse-table.tsx             # swap search call to client-side index
src/app/api/events/route.ts                 # delegate to data-source
src/app/api/events/[id]/route.ts            # delegate to data-source
src/app/api/connections/route.ts            # delegate to data-source
package.json                                # add build:data, prebuild, refresh, minisearch dep
public/data/summaries.json                  # GENERATED + committed
public/data/locations.json                  # GENERATED + committed
public/data/tags.json                       # GENERATED + committed
public/data/events/*.json                   # GENERATED + committed (120 files)
.gitignore                                  # ensure public/data is NOT ignored
next.config.ts                              # optional output:"export"
```
