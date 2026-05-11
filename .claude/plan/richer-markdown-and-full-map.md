# Plan: Richer Markdown Extraction + All Events on Map

## Task Type
- [x] Fullstack (Python extractor in `UFO-USA/` + Next.js webapp in `pursue-webapp/`)

## User Request (verbatim)
> "ok a few things, first the rn we have the document into markdown file but it doesnt contain any image or things, alot of it was lik────── i want to see all the events on the map"

Two distinct issues:
1. **Markdown extraction is text-only and noisy.** PDF pages are rendered to JPEG and OCR'd into pure text. No page images, no embedded photos/sketches/seals are saved. The `─` lines are Gemini transcribing table borders, dot-leader rules, and form dividers as horizontal-rule noise.
2. **Map shows only 80 of 120 events.** 22 events have multi-location strings (e.g. `"Hackensack, NJ; Midland, MI; Chicago, IL"`) that the single-string geocoder skips entirely. 18 events have `incident_location = "unknown"` or off-Earth (`"Moon"`, `"Low Earth Orbit"`). The map view filters by `lat/lng IS NOT NULL`, so 40 events are invisible.

---

## Current State (verified against repo)

### Markdown pipeline (`UFO-USA/scripts/process_dataset_with_gemini.py`)
- Renders each PDF page → JPEG @ 200 DPI in memory (`render_pdf_page`, L360-373).
- Sends image to Gemini with `DEFAULT_PROMPT` (L36-44) asking for plain-Markdown transcription.
- **Discards the rendered JPEG** after the API call — never written to disk.
- **No image extraction prompt** — Gemini outputs only `[illegible]`/`[redacted]` placeholders, no `![]()` embeds.
- Writes one `page-NNNN.md` per page to `converted/<slug>/`.

### Webapp ingestion (`pursue-webapp/scripts/ingest.ts`)
- Walks `converted/<slug>/page-*.md`, concatenates markdown into `events.full_text`.
- Geocodes `meta.incident_location` via `loadGeocode()` (L102-109) — only matches a single string against `data/geocoding.json`.
- Stores one `(latitude, longitude)` on the `events` row.

### Map view (`pursue-webapp/src/components/map-view.tsx`)
- Filters `events.filter((e) => e.latitude != null && e.longitude != null)` (L12).
- Shows badge "X docs not geocoded" (L56-60). No way to access those events from the map page.

### Database stats (live, queried)
```
total=120  geocoded=80  has_location_no_geocode=22  no_location=18
```

---

## Technical Solution

### Part 1: Richer Markdown — preserve page images + reduce divider noise

**Strategy: dual-output extraction.** Keep the existing OCR text, but also persist the rendered page JPEG to disk so the webapp can show "view original page" thumbnails alongside the transcription. Tighten the prompt so Gemini stops transcribing decorative rules.

Why not full image-region extraction (cropping each photo/diagram out)? Adds a bounding-box pass per page (more $ and double the latency for 184-page documents). The full-page JPEG already shows every photo/seal/signature in context — that is what "I want to see images" really means.

**Pipeline changes (`UFO-USA/scripts/process_dataset_with_gemini.py`):**

1. **Persist page JPEGs.** In `render_pdf_page` (L360-373) and `load_image_asset` (L376-385), write the rendered bytes to `converted/<slug>/page-NNNN.jpg` (smaller `max_side=1600` for web display). Atomic write next to the existing markdown.

2. **Update `DEFAULT_PROMPT` (L36-44)** to:
   - Add: `"Do not transcribe purely decorative horizontal rules, dot-leader lines, or form-field borders. Only include divider lines that separate distinct semantic sections (e.g. a heading break)."`
   - Add: `"If the page contains photographs, sketches, diagrams, official seals, or signatures, describe them inline in italics inside square brackets, e.g. *[photo of an airborne disc, ~30° elevation]*. Do not invent visual content that is not present."`
   - Add: `"At the top of the markdown body, include a single line: ![Page NNNN](./page-NNNN.jpg) so the rendered image is linked."`
   - Keep existing rules (don't invent text, `[illegible]`, `[redacted]`, blank-page handling).

3. **Front-matter additions** (`build_markdown_file`, L487-518):
   - Add `image_path: "page-NNNN.jpg"` so the webapp doesn't have to guess.
   - Add `image_max_side: 1600`.

4. **Regenerate strategy:**
   - **Don't re-OCR all ~22k pages.** The text is already fine for search.
   - Add a `--images-only` mode that re-renders + saves JPEGs for every existing page without calling Gemini.
   - Run full re-extraction (`--force`) only on user-flagged folders where dash-noise is bad.

**Webapp changes (`pursue-webapp/`):**

5. **Serve page images.** Two options:
   - **A. Symlink** `pursue-webapp/public/pages → ../../UFO-USA/converted` and reference via `/pages/<slug>/page-NNNN.jpg`. Simplest, no copy.
   - **B. Next.js rewrite** in `next.config.ts` to proxy `/pages/<slug>/<file>` to the UFO-USA path.
   - **Recommendation: A** for local dev.

6. **Render images in `EventDetailPanel`** (`src/components/event-detail-panel.tsx`):
   - Add a new `/api/events/[id]/pages` endpoint returning ordered page image URLs (`SELECT folder_name, page_count FROM events WHERE id = ?`, then build URLs).
   - Show a horizontal thumbnail strip below the bust assessment block: clicking a thumbnail expands to a lightbox.
   - Render `full_text` through `react-markdown` so the inline `*[photo of...]*` descriptions read cleanly.

7. **Defensive markdown cleanup** (`src/lib/format.ts`):
   - `cleanMarkdown(s: string) => s.replace(/^[─━—]{3,}\s*$/gm, "").replace(/^\s*[.·]{3,}\s*$/gm, "")` — post-process already-extracted pages we don't want to re-OCR.

### Part 2: All events on the map

**Strategy: split multi-location strings into N pins, off-Earth pins in a special row, unknown-location events in a sidebar list.**

**Schema change (`pursue-webapp/src/lib/db.ts`):**

1. **Add `event_locations` table:**
   ```sql
   CREATE TABLE event_locations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,        -- order in the original string
     location_text TEXT NOT NULL,      -- "Hackensack, New Jersey"
     latitude REAL,                    -- nullable for unknowns
     longitude REAL,
     geocode_source TEXT,              -- "manual" | "nominatim" | "off-earth"
     kind TEXT NOT NULL DEFAULT 'terrestrial'  -- 'terrestrial' | 'off-earth' | 'unknown'
   );
   CREATE INDEX idx_event_locations_event ON event_locations(event_id);
   ```
   Migration: backfill existing `events.latitude/longitude` into `event_locations` (position=0, kind='terrestrial'). Leave `events.lat/lng` in place for one release cycle for rollback safety. Keep `events.incident_location` as the raw display string.

**Ingest changes (`pursue-webapp/scripts/ingest.ts`):**

2. **Multi-location parser** (new helper, replaces single-string `geocode()` call at L321):
   - Split `meta.incident_location` on `;` (primary).
   - For each chunk, trim whitespace; preserve "City, State" pairs intact.
   - Pass each chunk through the existing `geocode()` function.
   - Hard-coded off-Earth list: `["moon", "lunar", "low earth orbit", "leo", "orbit"]` → `kind='off-earth'`, no lat/lng.
   - `"unknown"` / empty / null → `kind='unknown'`.
   - Write one `event_locations` row per parsed chunk.

3. **Expand `data/geocoding.json`** for the 22 multi-location events. Hand-curate ~20 new entries: Hackensack NJ, Midland MI, Koshkonong WI, Elkhorn WI, East Troy WI, Eagle WI, Muskego WI, Lily Lake IL, Mt. Adams district OR, Maury Island WA, Kelso WA, Hart Mountain OR, Swamp Lake OR, Flagstaff Lake OR, Campbell Lake OR, Stone Corral Lake OR, Savannah River Plant SC, Jackson MN, Hobson OH, Bakersfield CA.

4. **(Optional)** Add a `--geocode-online` flag that hits Nominatim with 1s rate limit + caches into `data/geocoding.json`. Defer unless hand-curation is tedious.

**API changes (`pursue-webapp/src/app/api/events/`):**

5. **`/api/events`** — add a `?expand=locations` query param (or sibling `/api/events/locations`) that flattens to one row per `(event, location)` pair for the map. Keep one-row-per-event for timeline/browse.

6. **`/api/events/[id]`** — include `locations: EventLocation[]` in the response so the detail panel can list every location pin.

**Map view changes (`pursue-webapp/src/components/map-view.tsx`):**

7. **Render pin per location.** Iterate `locations` (not events). Each pin keeps `event_id` so clicking still opens the same `EventDetailPanel`. Pins of the same event share a color (bust-score driven).

8. **Off-map drawer.** Replace the bottom-right badge with a left-side collapsible "Off-map events" drawer:
   - Section "Off-Earth (N)" — Moon, LEO, etc. Clickable rows open the detail panel.
   - Section "Unknown location (N)" — `"unknown"` events. Clickable rows open the detail panel.
   - Total count badge shown when drawer collapsed.

9. **Pin tooltip** should show the location's `location_text`, not the full semicolon string.

10. **(Optional)** Add `react-leaflet-cluster` / `Leaflet.markercluster` once pin count reaches ~160-180. Defer unless overlap becomes a problem.

---

## Implementation Steps

### Phase A — Map (Part 2), short loop, no Gemini cost
| # | Step | Files | Deliverable |
|---|------|-------|-------------|
| A1 | Add `event_locations` table + migration | `src/lib/db.ts` | Schema + backfill SQL |
| A2 | Update types | `src/lib/types.ts` | `EventLocation` interface |
| A3 | Multi-location parser + ingest write | `scripts/ingest.ts` (L321 area) | All 120 events have ≥1 `event_locations` row |
| A4 | Expand `data/geocoding.json` | `data/geocoding.json` | ~20 new manual entries |
| A5 | Re-run ingest with `--force --no-llm` | (run) | DB shows ~160-180 location rows |
| A6 | API: flatten endpoint or expand param | `src/app/api/events/route.ts`, `[id]/route.ts` | Map fetches flat `(event, loc)` pairs |
| A7 | Update queries | `src/lib/queries.ts` | `getEventLocations()` |
| A8 | Map view: per-location pins + drawer | `src/components/map-view.tsx`, new `off-map-drawer.tsx` | All 120 events reachable from map page |
| A9 | Manual smoke: open `/map`, click each drawer item | (browser) | No regressions |

### Phase B — Markdown (Part 1), longer because of re-extraction
| # | Step | Files | Deliverable |
|---|------|-------|-------------|
| B1 | Add `--save-page-images` + `--images-only` flags | `UFO-USA/scripts/process_dataset_with_gemini.py` | JPEG written next to MD |
| B2 | Update prompt | same file, `DEFAULT_PROMPT` L36-44 | Less divider noise, inline image descriptions |
| B3 | Update `build_markdown_file` front-matter | same file, L487-518 | `image_path`, `image_max_side` |
| B4 | Run `--images-only` over all 120 folders | (run) | Every page has a `.jpg` sibling |
| B5 | Symlink `public/pages` | (shell) | Page images at `/pages/<slug>/page-NNNN.jpg` |
| B6 | New API: `/api/events/[id]/pages` | `src/app/api/events/[id]/pages/route.ts` | Returns ordered page image URLs |
| B7 | Thumbnail strip + lightbox | `src/components/event-detail-panel.tsx` | Visual context per page |
| B8 | Render markdown with `react-markdown` | `src/components/event-detail-panel.tsx` | Clean rendering, italic image-descriptions |
| B9 | Defensive markdown cleanup | `src/lib/format.ts` | `cleanMarkdown()` strips legacy dash-rules |
| B10 | Targeted re-OCR `--force` on user-flagged folders | (run) | Cleaner output where it mattered |

---

## Key Files Touched

| File | Operation | Notes |
|------|-----------|-------|
| `UFO-USA/scripts/process_dataset_with_gemini.py` | Modify L36-44, L360-385, L487-518; add flags | Image persistence + prompt cleanup |
| `pursue-webapp/src/lib/db.ts` | Add table + migration | `event_locations` |
| `pursue-webapp/src/lib/types.ts` | Add interface | `EventLocation` |
| `pursue-webapp/src/lib/queries.ts` | Add function | `getEventLocations()` |
| `pursue-webapp/src/lib/format.ts` | Add function | `cleanMarkdown()` |
| `pursue-webapp/scripts/ingest.ts` | Replace single-geocode block at L321 | Multi-location parsing |
| `pursue-webapp/data/geocoding.json` | Add ~20 entries | Hand-curated lookups |
| `pursue-webapp/src/app/api/events/route.ts` | Extend with `?expand=locations` | Map data shape |
| `pursue-webapp/src/app/api/events/[id]/route.ts` | Include `locations[]` | Detail panel |
| `pursue-webapp/src/app/api/events/[id]/pages/route.ts` | NEW | Page image list |
| `pursue-webapp/src/components/map-view.tsx` | Refactor to per-location | All events visible |
| `pursue-webapp/src/components/off-map-drawer.tsx` | NEW | Unknown + off-Earth events |
| `pursue-webapp/src/components/event-detail-panel.tsx` | Add thumb strip + markdown render | Visual context |
| `pursue-webapp/public/pages` (symlink) | NEW | Serve page JPEGs |
| `pursue-webapp/package.json` | Add `react-markdown` | Dep |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Re-OCR of all pages costs $$ on Gemini | Default to `--images-only` (no API calls); re-OCR only user-flagged folders |
| Page JPEGs blow up disk (~120 docs × ~184 pages × ~80 KB ≈ ~1.7 GB at max_side=1600 q=80) | Acceptable for local; alternative is on-demand generation on first request |
| Multi-location parser splits a comma in "Washington, D.C." into two pins | Split on `;` primarily; only consider `,` splitting when both halves look like distinct geo entries. Hand-test the 22 known multi-loc events. |
| Geocoding multi-location events doubles row count and breaks browse-table pagination | Browse and timeline views still use one row per `event`; only the map joins `event_locations`. Pagination unchanged. |
| Symlink approach breaks if someone clones to a different layout | Document in README; offer `next.config.ts` rewrite as a fallback. |
| `react-markdown` with raw OCR text might render unexpected HTML | Use safe defaults; no `rehype-raw`. The text is markdown-by-prompt, not HTML. |
| `event_locations` migration on existing DB | Idempotent: create table if not exists, backfill where empty, leave existing `events.lat/lng` for one release cycle. |

---

## Phasing Recommendation

**Ship Phase A first** (map fix) — smaller, no Gemini spend, immediately visible. The user explicitly said "I want to see all the events on the map," which is the higher-impact request. Phase B (richer markdown) is more code and is the slower-burn improvement.

Estimated effort:
- Phase A: ~1 dev-day end-to-end.
- Phase B: ~1.5 dev-days + image re-render runtime (~30 min over all pages at low DPI).

---

## SESSION_ID (for `/ccg:execute` use)
- CODEX_SESSION: not-used (single-model planning in main context)
- GEMINI_SESSION: not-used (single-model planning in main context)

> Note: the dual-model analysis step in `/multi-plan` was skipped because (a) the prior session showed Codex auth issues for this project, (b) the request is well-scoped enough that synthesis from repo context is sufficient, and (c) Phase A is small enough to verify directly. If you want a second-opinion model pass before executing, invoke `/ccg:analyze` on this file.
