# Plan: Inline Map Detail + Connections Tab + Chinese Toggle + Cover-up Scoring

## Task Type
- [x] Fullstack (`pursue-webapp` Next.js app + `scripts/ingest.ts` Gemini pipeline + SQLite schema)

## User Request (verbatim)
> "so first isthat event doesnt relly show, it get overlap by the mapviewer, i will need it to be on the right side of map when we click an event so we can also click other event without need to close current first, and then i want the connection tab and then i want the abality to one click and translate into chinese, pre-translated so api cost only one time, and last is that currently analysis almost make everything fake? but something is clearly unexplainable or etc, goverment coverup etc"

Four work items:
1. **Inline detail panel on /map** — current Radix Sheet is modal; its overlay blocks map clicks so the user must close before clicking the next pin. Replace with a non-modal, persistent right-side panel.
2. **Connections / Investigate tab** — surface events that share descriptors (e.g. "gold disc", "instant acceleration", "redacted follow-up") across different times/places.
3. **Chinese language toggle** — pre-translate every event field at ingest time so the runtime button just flips between fields. Zero per-user API cost.
4. **Bust prompt re-calibration + cover-up scoring** — the current bust scores cluster around 80-95 ("everything is mundane"). Tune the anchors and add a separate `cover_up_score` for documents that show concealment patterns regardless of how mundane the underlying sighting is.

> Note: This plan was produced inline by Claude with full conversational context on the codebase (we've been editing it in this session). Multi-model Codex/Gemini analysis was intentionally skipped to avoid 10+ min latency and ~$5+ token cost without proportional plan-quality gain. Tell me to re-run with multi-model if you want a second opinion before executing.

---

## Current State (verified against repo)

### Detail panel (`src/components/event-detail-panel.tsx`)
- Uses Radix `Sheet` (modal). Open state controlled by `selectedId != null`.
- `SheetContent side="right" sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-5xl` — width is OK, but the Radix overlay still blocks pointer events on whatever is behind it (the map). So you cannot click another pin without first closing.
- Imported by `map-view.tsx`, `browse-table.tsx`, `timeline.tsx`.

### Map (`src/components/map-view.tsx`)
- Renders `<MapContainer>` filling `h-[calc(100vh-3.5rem)]` (viewport minus 56px nav).
- After today's fix: 30 distinct events as ~33 jittered pins + `<OffMapDrawer />` for off-Earth/no-precise-location.

### Top nav (`src/app/layout.tsx`)
- Sticky 56px header with `Timeline | Browse | Map` links. New "Connections" tab + EN|中文 toggle slot in here.

### Ingest (`scripts/ingest.ts`)
- Two Gemini calls per event: `METADATA_MODEL` (line 32) for structured extraction, `BUST_MODEL` (line 33) for bust scoring. Both currently `gemini-2.5-flash`.
- `TRUNCATE_CHARS=30_000`, `BUST_TRUNCATE_CHARS=20_000`.
- Bust prompt anchors live around L222–230, schema around L240–280 (need to widen + add cover-up fields).
- Persistence: `persistEvent()` writes `events` row + child tables. Adding `_zh` columns and a `event_tags` table is local-only — no external schema migration needed; better-sqlite3 just executes the new `CREATE TABLE IF NOT EXISTS` on startup.

### Database (`src/lib/db.ts`)
- Schema is inlined as a string and executed on `getDb()` first call. Idempotent (uses `IF NOT EXISTS`). Adding new tables/columns means appending to the schema string + appending one-shot guarded `ALTER TABLE` migrations (SQLite needs an explicit check, see §Schema Migrations below).

### Live counts (queried just now)
```
events:        120
bust_filled:   95   (rest are document_type=photo_metadata, correctly skipped)
event_locations:  122   (33 terrestrial / 4 off-earth / 85 unknown)
geocoded:      28 distinct coord pairs
```

---

## Sequencing & Re-ingest Strategy

The four features have different costs:

| Feature | Schema change | Re-ingest? | Cost |
|---|---|---|---|
| 1. Inline detail panel | none | no | ~1h Claude time |
| 2. Connections / tags | new table `event_tags` | yes (extract tags) | folded into metadata call (no extra Gemini) |
| 3. Chinese pre-translation | new `_zh` columns | yes (translate) | +1 Gemini call per event |
| 4. Bust re-cal + cover-up | new cover_up_* columns | yes (re-run bust w/ new prompt + schema) | replaces existing bust call (no net new call) |

**Strategy**: ship Feature 1 first (pure frontend, no re-ingest), then bundle 2+3+4 into a single re-ingest pass so the user pays the Gemini cost once.

Estimated bundled re-ingest cost: 120 events × (1 metadata call + 1 bust+coverup call + 1 translation call). ~3 Gemini calls per event vs current 2. With Flash that's roughly $1-2 total and ~60-90 min runtime.

---

## Phase A: Inline Detail Panel on /map

### Files

| File | Operation | Purpose |
|---|---|---|
| `src/components/event-detail-body.tsx` | Create | Pure presentational body (loading/empty/loaded states). No Sheet wrapper. |
| `src/components/event-detail-panel.tsx` | Refactor | Becomes a thin Sheet wrapper around `<EventDetailBody>`. Used by `/`, `/browse`. |
| `src/components/event-detail-inline.tsx` | Create | Non-modal side panel for `/map`. Same body, sticky right column, includes collapse-to-icon button. |
| `src/components/map-view.tsx` | Modify | Wrap `<MapContainer>` + `<EventDetailInline>` in a `flex flex-row` shell. Remove the `<EventDetailPanel>` Sheet usage. |
| `src/app/map/page.tsx` | No change | Already passes events/locations down. |

### Layout (pseudo-code)

```tsx
// map-view.tsx (return)
<div className="flex h-[calc(100vh-3.5rem)] w-full">
  <div className="relative flex-1">
    <MapContainer ... />
    <OffMapDrawer .../>
  </div>
  <EventDetailInline
    selectedId={selectedId}
    onClose={() => setSelectedId(null)}
    onSelect={setSelectedId}
    className={cn(
      "border-l border-zinc-800 bg-zinc-950 transition-[width] duration-200",
      collapsed ? "w-12" : "w-[40rem] max-w-[50vw]"
    )}
  />
</div>
```

- When `selectedId == null`: panel shows placeholder "Click a pin to view details. Click another pin anytime — no need to close."
- When `selectedId` set: panel fetches `/api/events/{id}` and renders `<EventDetailBody>`.
- Clicking a different pin → `setSelectedId(newId)` → effect re-fetches → body re-renders. No close cycle. (This is the existing data flow; the only structural change is removing the modal overlay.)
- Collapse button: tiny `<<` chevron at panel's left edge. Collapsed state is `w-12` and shows just the chevron `>>` to re-expand. Persisted in `localStorage("map.panel.collapsed")`.

### Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Leaflet map needs `invalidateSize()` when its container width changes (after collapse) | Add a `useEffect` watching `collapsed` that calls `map.invalidateSize()` via a ref. |
| Mobile: 50vw side-by-side is unusable on narrow screens | Below `md:` breakpoint, fall back to existing Sheet behavior via `useMediaQuery`. |
| Detail body fetches every click → slight delay | Already happens. Acceptable. Optionally pre-fetch on hover later. |

### Acceptance criteria

- [ ] Open `/map`, click pin A → detail loads on the right.
- [ ] Click pin B without closing → detail switches to event B; map remains interactive.
- [ ] Collapse arrow shrinks panel to ~48px; click expands back.
- [ ] Map tiles re-fit (no gray gutter) after expand/collapse.
- [ ] Existing Sheet behavior on `/` and `/browse` unchanged.

---

## Phase B: Schema Migrations (one block, runs on next `getDb()` call)

Add to `src/lib/db.ts` SCHEMA string. SQLite doesn't have `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so we use a guarded migration block via `PRAGMA table_info()` checks.

### Schema additions

```sql
-- 1. Connections / tags
CREATE TABLE IF NOT EXISTS event_tags (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category  TEXT NOT NULL,   -- 'object' | 'behavior' | 'shape' | 'color' | 'theme'
  tag       TEXT NOT NULL    -- normalized lowercase, hyphen-separated
);
CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag   ON event_tags(category, tag);

-- 2. Cover-up scoring
-- ALTER TABLE events ADD COLUMN cover_up_score INTEGER;
-- ALTER TABLE events ADD COLUMN cover_up_reasoning TEXT;
CREATE TABLE IF NOT EXISTS event_cover_up_indicators (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rank          INTEGER NOT NULL,
  indicator     TEXT NOT NULL  -- e.g. "heavy redaction throughout", "classified follow-up referenced"
);

-- 3. Chinese translations on events row (parallel _zh columns)
-- ALTER TABLE events ADD COLUMN title_zh TEXT;
-- ALTER TABLE events ADD COLUMN summary_zh TEXT;
-- ALTER TABLE events ADD COLUMN reported_object_description_zh TEXT;
-- ALTER TABLE events ADD COLUMN reported_behavior_zh TEXT;
-- ALTER TABLE events ADD COLUMN official_resolution_zh TEXT;
-- ALTER TABLE events ADD COLUMN bust_reasoning_zh TEXT;
-- ALTER TABLE events ADD COLUMN cover_up_reasoning_zh TEXT;
-- ALTER TABLE events ADD COLUMN incident_location_zh TEXT;

-- 4. Chinese on child tables
-- ALTER TABLE event_claims ADD COLUMN claim_zh TEXT;
-- ALTER TABLE event_bust_explanations ADD COLUMN explanation_zh TEXT;
-- ALTER TABLE event_cover_up_indicators ADD COLUMN indicator_zh TEXT;
```

### Migration helper

```ts
// src/lib/db.ts
function ensureColumn(db: DB, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// On db init:
ensureColumn(db, "events", "cover_up_score", "INTEGER");
ensureColumn(db, "events", "cover_up_reasoning", "TEXT");
ensureColumn(db, "events", "title_zh", "TEXT");
// ... etc
ensureColumn(db, "event_claims", "claim_zh", "TEXT");
ensureColumn(db, "event_bust_explanations", "explanation_zh", "TEXT");
```

Idempotent. Safe to re-run.

### Type updates (`src/lib/types.ts`)

Add to `EventRecord`:
```ts
cover_up_score: number | null;
cover_up_reasoning: string | null;
cover_up_indicators: string[];
title_zh: string | null;
summary_zh: string | null;
// ... all _zh fields
tags: Array<{ category: string; tag: string }>;
```

Add to `EventSummary`:
```ts
cover_up_score: number | null;
title_zh: string | null;
incident_location_zh: string | null;
```

---

## Phase C: Ingest Pipeline Update (one re-ingest run covers features 2+3+4)

### Bust prompt re-calibration + cover-up

In `scripts/ingest.ts`:

1. **Rewrite bust prompt anchors** (currently around L222–230):
   - Move "neutral" to 50, not 70.
   - Reserve `>=80` for cases with clear prosaic explanation present in the document itself.
   - Reserve `<=20` for multi-sensor convergence + corroborating witnesses + no plausible misID after explicit listing.
   - Add: "If multiple independent sensors (e.g. radar AND FLIR AND visual) report convergent kinematics, DO NOT dismiss as misID unless the document itself names the misID source."

2. **Add cover-up schema to bust response**:
```ts
const bustSchema = {
  type: "object",
  properties: {
    bust_score: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
    bust_explanations: { /* existing */ },
    cover_up_score: { type: "integer", minimum: 0, maximum: 100 },
    cover_up_reasoning: { type: "string" },
    cover_up_indicators: {
      type: "array",
      items: { type: "string" },
      description: "Concrete indicators of intentional concealment present in the document"
    }
  },
  required: ["bust_score", "reasoning", "cover_up_score", "cover_up_reasoning", "cover_up_indicators"]
};
```

3. **Append to bust prompt**:
   > "Independently of bust_score, assess concealment: how much does this document indicate the government tried to suppress, redact, or downplay the encounter? Score 0 (no concealment evident) to 100 (extensive concealment: classified follow-ups, name redactions on non-witness officials, sentence-level black-bar redaction of >30% of pages, contradictory public statements, witness intimidation language). cover_up_indicators must be specific phrases or page references from the document."

### Tag extraction (folded into metadata call)

Append to existing metadata schema:
```ts
tags: {
  type: "object",
  properties: {
    object:   { type: "array", items: { type: "string" } },   // ["gold", "metallic", "disc"]
    behavior: { type: "array", items: { type: "string" } },   // ["hovering", "instant-acceleration"]
    shape:    { type: "array", items: { type: "string" } },   // ["disc", "cigar", "triangle"]
    color:    { type: "array", items: { type: "string" } },   // ["gold", "white", "luminous"]
    theme:    { type: "array", items: { type: "string" } }    // ["multi-sensor", "humanoid-witness", "military-engagement"]
  }
}
```

Prompt addition (in metadata system instruction):
> "Extract tag descriptors. Use lowercase hyphenated tokens. Be specific but conservative — only include a tag if the document text directly supports it. Prefer 'gold' over 'gold-colored', 'disc' over 'disc-shaped'. Multi-word tags use hyphens: 'instant-acceleration', 'multi-sensor'. Do not invent tags not grounded in the text."

### Translation pass (new third Gemini call)

```ts
const TRANSLATION_MODEL = "gemini-2.5-flash";

interface TranslationOut {
  title_zh: string;
  summary_zh: string;
  reported_object_description_zh: string;
  reported_behavior_zh: string;
  official_resolution_zh: string;
  incident_location_zh: string;
  bust_reasoning_zh: string;
  cover_up_reasoning_zh: string;
  key_claims_zh: string[];
  bust_explanations_zh: string[];
  cover_up_indicators_zh: string[];
}

async function translate(en: TranslationIn): Promise<TranslationOut> {
  // Single Gemini call. Pass all en fields as JSON. Ask for the same shape with _zh suffix.
  // Use structured output (responseSchema) to guarantee shape.
  // System instruction: "Translate technical/military UAP report fields from English to Mandarin
  // Simplified Chinese. Preserve technical terms (FLIR, NORTHCOM) untranslated when no clean Chinese
  // equivalent exists. Match register: government cable English → formal 公文体."
}
```

Persistence: after translate(), in `persistEvent()`, write the `_zh` columns and the per-row `_zh` for child tables.

### Persistence updates (`persistEvent`)

```ts
// Extend INSERT INTO events to include all new columns.
// After main INSERT:
const insTag = db.prepare(`INSERT INTO event_tags (event_id, category, tag) VALUES (?,?,?)`);
for (const [cat, tags] of Object.entries(m.tags ?? {})) {
  for (const t of tags) insTag.run(eventId, cat, t);
}
const insCu = db.prepare(`INSERT INTO event_cover_up_indicators (event_id, rank, indicator, indicator_zh) VALUES (?,?,?,?)`);
(args.bust?.cover_up_indicators ?? []).forEach((ind, i) =>
  insCu.run(eventId, i, ind, args.translation?.cover_up_indicators_zh?.[i] ?? null)
);
// event_claims and event_bust_explanations get claim_zh / explanation_zh during their existing inserts.
```

### Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Translation call fails for some events → mixed-language DB | Wrap translation call in try/catch; on failure, leave `_zh` columns NULL. UI falls back to English with a small `(EN only)` badge. |
| Gemini's tag taxonomy drifts (e.g. emits "golden" vs "gold") | Post-normalize in `persistEvent`: lowercase, hyphenate spaces, dedup. Optionally maintain a small canonical-tag map in `data/tag-aliases.json`. |
| Cover-up score is just bust-score-inverted in practice | Calibrate after first run on 5 known cases (FBI 1947 Roswell-adjacent files = high cover_up + high bust; Aguadilla 2013 = low cover_up + low bust); tune anchors if signals collapse. |
| Bust prompt change shifts existing scores by ±30 | Expected and desired — but the user should see the diff. Print before/after histogram in console after re-ingest. |

---

## Phase D: UI for Features 2 + 3 + 4

### Feature 2 UI — Connections page

| File | Operation |
|---|---|
| `src/app/connections/page.tsx` | Create — server component fetching aggregated tag data |
| `src/app/connections/connections-client.tsx` | Create — interactive filter/intersect UI |
| `src/lib/queries.ts` | Add `getTagAggregates()`, `getEventsByTagIntersection(tags[])` |
| `src/app/layout.tsx` | Add `<NavLink href="/connections" label="Connections" />` |

Layout:
```
+-------------------------------------------------+
| TAGS                    | SELECTED              |
| [search/filter]         |  • gold (12)          |
|                         |  • disc (8)           |
| Object                  |  • multi-sensor (5)   |
|  gold (12) disc (8)...  | [Clear all]           |
| Behavior                |                       |
|  hovering (7) ...       | EVENTS MATCHING ALL   |
| Shape                   |  → 1947 Roswell ...   |
|  ...                    |  → 2003 Aguadilla...  |
| Theme                   |  → 2021 Indopac ...   |
|  multi-sensor (5) ...   | (3 events, 1947-2021) |
+-------------------------------------------------+
```

- Selecting a tag adds it to the right column. Multiple selected = AND across categories.
- "Anomalous clusters" toggle: auto-highlights tag intersections that produce ≥3 events spanning ≥10 years.
- Each event row opens the inline panel.

### Feature 3 UI — Language toggle

| File | Operation |
|---|---|
| `src/lib/i18n.ts` | Create — `Locale = 'en' \| 'zh'`, UI string dicts, helper `pickField(record, key, locale)` |
| `src/components/locale-provider.tsx` | Create — React context backed by cookie (`pursue-locale`) |
| `src/components/locale-toggle.tsx` | Create — `EN | 中文` button in nav |
| `src/app/layout.tsx` | Wrap `<main>` in `<LocaleProvider>`. Add `<LocaleToggle>` to nav |
| All event-display components | Replace `event.title` → `pickField(event, "title", locale)` etc. |

Helper signature:
```ts
function pickField<K extends string>(record: any, key: K, locale: Locale): string | null {
  if (locale === "zh") return record[`${key}_zh`] ?? record[key] ?? null;
  return record[key] ?? null;
}
```

Cookie-backed locale: read once in root layout via `cookies()`, hydrate context. Toggle writes via `document.cookie` (static-export-friendly — no server action needed).

UI strings (chrome) kept in `i18n.ts` as a plain dict:
```ts
export const STRINGS = {
  en: { timeline: "Timeline", browse: "Browse", map: "Map", connections: "Connections", ... },
  zh: { timeline: "时间线",   browse: "浏览",   map: "地图", connections: "关联", ... }
};
```

### Feature 4 UI — Cover-up badge

| File | Operation |
|---|---|
| `src/components/cover-up-pill.tsx` | Create — mirror of `bust-pill.tsx`. Color scale opposite (high = red/alarm, low = neutral). |
| `src/lib/format.ts` | Add `coverUpClasses()` helper |
| `src/components/event-detail-body.tsx` | Render both BustPill + CoverUpPill in header |
| `src/components/event-card.tsx`, `timeline.tsx`, `browse-table.tsx` | Add cover-up pill alongside bust pill |
| Map pin coloring | Optional: split pin into half-bust/half-coverup ring. Defer to follow-up if cramped. |

---

## Phase E (deferred): Vercel Static Export

After Phases A-D land:

| Step | File | Notes |
|---|---|---|
| 1 | `scripts/build-static-json.ts` (new) | Read SQLite, write `public/data/events.json`, `public/data/locations.json`, `public/data/tags.json`. Run as `prebuild` hook. |
| 2 | `src/lib/data-source.ts` (new) | Single import point. In `process.env.NEXT_PUBLIC_DATA_SOURCE === "json"` mode, read static JSON; otherwise use SQLite. |
| 3 | `next.config.ts` | Add `output: "export"` (or keep ISR — depends on whether `/api/events/[id]` route stays). For pure static, replace API route with import. |
| 4 | `package.json` | `scripts.build` runs `tsx scripts/build-static-json.ts && next build` |
| 5 | Vercel deploy | Push to GitHub, connect repo, no env vars needed (no Gemini key on server side). |

Defer until Phases A-D are smoke-tested locally — no point optimizing for deploy before the features land.

---

## Risks (cross-phase)

| Risk | Mitigation |
|---|---|
| Re-ingest cost > expected | Use `--only` flag to run on 5 calibration folders first; check output quality and cost before unleashing on all 120. |
| Schema migrations break existing dev DB | Migrations are guarded with `PRAGMA table_info()` checks → idempotent. Worst case: delete `data/pursue.db` and re-ingest (we've done this multiple times already). |
| Chinese translation quality varies on technical jargon | Spot-check 5 events post-translation; if quality drops, swap `TRANSLATION_MODEL` to `gemini-2.5-pro` (translation is one-shot per event so the 2× slowdown is bounded). |
| Cover-up score becomes redundant with bust score | After first run, plot correlation. If r > 0.85, the prompt needs harder separation language (re-tune, not re-architect). |
| Inline panel doesn't fit on screens < 1024px wide | `md:` breakpoint guard falls back to existing modal Sheet. Documented above. |

---

## Implementation Order (execution-ready)

**Sprint 1 — Inline detail panel (Phase A) — ~1-2h, no re-ingest**
1. Create `event-detail-body.tsx` (extract body from existing panel).
2. Refactor `event-detail-panel.tsx` to wrap `<EventDetailBody>`.
3. Create `event-detail-inline.tsx` (non-modal side panel + collapse).
4. Refactor `map-view.tsx` to flex layout. Drop Sheet from /map.
5. Add `map.invalidateSize()` effect on collapse change.
6. Smoke-test: click multiple pins in sequence, verify map clickability.
7. Commit.

**Sprint 2 — Schema migrations (Phase B) — ~30 min, no re-ingest yet**
1. Extend `src/lib/db.ts` SCHEMA with new tables + `ensureColumn` helper.
2. Extend `src/lib/types.ts` with new fields.
3. Hit `getDb()` once locally to verify migrations apply cleanly.
4. Commit.

**Sprint 3 — Ingest pipeline (Phase C ingest portion) — ~1-2h coding + ~60-90 min re-ingest run**
1. Update metadata prompt to include `tags`.
2. Update bust prompt + schema for cover-up.
3. Add `translate()` function + new Gemini call.
4. Extend `persistEvent()` for tags + cover-up + _zh fields.
5. Test on 5 folders via `--only`. Inspect output.
6. If good: `npx tsx scripts/ingest.ts --force` for all 120. ~60-90 min.
7. Print before/after bust score histogram for calibration check.
8. Commit DB and config (not the run output itself).

**Sprint 4 — Connections UI (Feature 2) — ~2h**
1. Add `getTagAggregates`, `getEventsByTagIntersection` to queries.ts.
2. Create `/connections` page + client component.
3. Add nav link.
4. Smoke-test with a known multi-sensor cluster.

**Sprint 5 — Language toggle (Feature 3) — ~2h**
1. Create `src/lib/i18n.ts` with UI string dicts.
2. Create `<LocaleProvider>` + `<LocaleToggle>`.
3. Wrap layout, add toggle to nav.
4. Replace event-field renders with `pickField()` calls.
5. Smoke-test toggling on /map, /, /browse, /connections.

**Sprint 6 — Cover-up UI (Feature 4) — ~1h**
1. Create `CoverUpPill` + `coverUpClasses()`.
2. Add to detail body header + event cards.

**Sprint 7 (deferred) — Vercel static export (Phase E)**

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `n/a` — multi-model analysis not run; Claude planned with full conversational context
- GEMINI_SESSION: `n/a` — same

---

## File checklist (every file touched)

```
src/lib/db.ts                                     # schema additions + ensureColumn helper
src/lib/types.ts                                  # EventRecord/Summary extended
src/lib/queries.ts                                # getTagAggregates, getEventsByTagIntersection, _zh-aware reads
src/lib/i18n.ts                                   # NEW — UI strings + pickField helper
src/lib/format.ts                                 # coverUpClasses()
scripts/ingest.ts                                 # bust prompt re-cal, cover-up schema, tag extraction, translate()
src/app/layout.tsx                                # nav: + Connections, + LocaleToggle, wrap LocaleProvider
src/app/map/page.tsx                              # no change (data flow already correct)
src/app/connections/page.tsx                      # NEW
src/app/connections/connections-client.tsx        # NEW
src/components/event-detail-body.tsx              # NEW — presentational body
src/components/event-detail-panel.tsx             # refactored — thin Sheet wrapper
src/components/event-detail-inline.tsx            # NEW — non-modal side panel
src/components/map-view.tsx                       # flex layout, drop Sheet
src/components/cover-up-pill.tsx                  # NEW
src/components/locale-provider.tsx                # NEW
src/components/locale-toggle.tsx                  # NEW
src/components/event-card.tsx                     # + cover-up pill, + locale-aware fields
src/components/browse-table.tsx                   # + locale-aware fields
src/components/timeline.tsx                       # + locale-aware fields
src/app/api/events/[id]/route.ts                  # include tags + cover_up_* + _zh fields in JSON
src/app/api/events/route.ts                      # include cover_up_score in summary if filter wanted
```
