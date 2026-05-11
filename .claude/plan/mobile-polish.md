# Plan: Mobile-Friendly Polish

## Task Type
- [x] Frontend polish — responsive breakpoints, touch ergonomics, conditional renders

## User Request (verbatim)
> "i want to do it one shot so anyone can use thiker with it and my firend non tech can view webpage vercal. but mostlike they will be on mobile lets talk first, how hard and useful to turn into mobile friendly if not we just give let it be desktop"
> — then: "yes do m" (= plan Sprint 8 mobile polish before Vercel deploy)

Goal: make the app genuinely usable on a 375px iPhone viewport so non-technical friends can open the Vercel URL on their phones and explore without bouncing. Sequence: ship Sprint 8 → ship Sprint 7 (Vercel static export) → share link.

**Status**: parked here, ready to execute. Will run after the user confirms.

---

## Audit (375px viewport, what fails today)

| Page | State | Severity |
|---|---|---|
| `/` Timeline | Horizontal-scrolling year-grouped cards. Already touch-friendly. | 80% OK |
| `/connections` | `grid-cols-1 lg:grid-cols-[420px_1fr]` collapses to single column. Tag pills tappable. | 70% OK |
| `/browse` | Filter sidebar consumes ~250px of 375px; 6-column table horizontal-scrolls and is unreadable. | **Bad** |
| `/map` | Inline detail panel set to `w-[40rem] max-w-[55vw]` → map gets ~45% of screen. CircleMarker radius 7px is too small to tap. Off-map drawer is an absolute corner overlay. | **Bad — and this is the share-screenshot page** |
| Detail panel (Sheet variant on `/` and `/browse`) | Radix Sheet defaults to `w-full` on `<sm:` → already fullscreen-modal on mobile. | OK by accident |
| Top nav | 4 links + EN/中文 toggle + "local · v0" — version label competes for width below 360px. | 70% OK |

---

## Strategy: CSS-driven branching (no JS media query) + one hook

The cleanest pattern in Tailwind: render both variants and hide one with `md:hidden` / `hidden md:flex`. Zero hydration mismatch, no flicker, no useEffect needed.

But: where two panels share state (selectedId on /map), we'd render both Sheet AND inline panel and both would try to open simultaneously. Solution: use a `useMediaQuery` hook with an SSR-safe default that renders only the appropriate panel.

**Picked approach**:
- For UI that's purely presentational (nav, drawer): CSS-driven with `md:hidden` / `hidden md:flex`.
- For state-coupled UI (map page panel selection): `useMediaQuery` hook with initial-mount guard so we render only the desktop panel until mounted, then switch on mobile. Avoids "both panels open" race.

---

## File-by-file plan

### 1. `src/lib/use-media-query.ts` — new hook

```ts
"use client";
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  // First-render default: false. After mount, real value. Prevents hydration mismatch.
  const [matches, setMatches] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    setMounted(true);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return mounted ? matches : false;
}

// Convenience: "is the viewport below the md breakpoint (Tailwind: 768px)?"
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
```

Callers: `src/components/map-view.tsx`, possibly `src/components/event-detail-inline.tsx` (defensive).

### 2. `src/components/map-view.tsx` — branch panel by viewport

| Change | Why |
|---|---|
| `import { useIsMobile } from "@/lib/use-media-query"` | Detect mobile |
| `import { EventDetailPanel } from "./event-detail-panel"` | Sheet variant for mobile (fullscreen modal on `<sm:`) |
| Top-level shell: keep `flex` row layout but add `flex-col md:flex-row` so on mobile the map fills its row and the inline panel isn't a sibling column | Map gets full width on mobile |
| Render either `<EventDetailInline>` OR `<EventDetailPanel>` based on `isMobile`. Mobile gets the Sheet which already goes fullscreen on `<sm:`. | Single source of truth for `selectedId` |
| `<CircleMarker radius={isMobile ? 11 : 7}>` | Bigger fingertip-friendly tap targets on touch |
| Keep `mapRef.invalidateSize()` effects — they already handle window resize | No new work |

```tsx
const isMobile = useIsMobile();
// ...
<div className="flex h-[calc(100vh-3.5rem)] w-full flex-col md:flex-row">
  <div className="relative flex-1">
    <MapContainer ... />
    <OffMapDrawer ... />
  </div>
  {isMobile ? (
    <EventDetailPanel selectedId={selectedId} onClose={() => setSelectedId(null)} />
  ) : (
    <EventDetailInline
      selectedId={selectedId}
      onClose={() => setSelectedId(null)}
      onCollapseChange={handleCollapseChange}
    />
  )}
</div>
```

### 3. `src/components/off-map-drawer.tsx` — bottom-sheet style on mobile

Today: `absolute left-4 top-4` overlay corner. On a 375px phone this floats over the map blocking the left edge.

Fix: add `md:absolute md:left-4 md:top-4` and on mobile (`<md:`) render at the bottom as a sticky strip:

```tsx
<div className={cn(
  // Mobile: bottom strip; Desktop: top-left overlay
  "fixed inset-x-0 bottom-0 z-[400] rounded-t-lg border-t border-zinc-700 bg-zinc-900/95 ...",
  "md:absolute md:left-4 md:top-4 md:right-auto md:bottom-auto md:max-h-[calc(100vh-7rem)] md:rounded md:border md:border-zinc-700"
)}>
  {/* same button + open state as today */}
</div>
```

When tapped on mobile, it expands upward (`max-h-[60vh]` cap) and scrolls. No need for a separate "MobileDrawer" component — just responsive classes.

### 4. `src/components/browse-table.tsx` — drawer filter + card list on mobile

Today: `flex h-[...] ` with `<Filters>` sidebar always visible + `<Table>` to the right.

Fix:
- Below `md:`: hide the sidebar. Show a top toolbar with "Filters (count)" button → opens `<Filters>` inside a Sheet.
- Below `md:`: replace `<Table>` with a vertical card stack using existing `<EventCard>` (already mobile-friendly from Timeline).
- Above `md:`: keep the existing sidebar + table layout.

Pseudo:
```tsx
<div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
  {/* Desktop sidebar — hidden on mobile */}
  <div className="hidden md:block">
    <Filters ... />
  </div>

  {/* Mobile toolbar */}
  <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 md:hidden">
    <button onClick={() => setFiltersOpen(true)} className="font-mono text-xs ...">
      Filters {activeCount > 0 && `(${activeCount})`}
    </button>
    <span className="font-mono text-[11px] text-zinc-500">{rows.length} of {total}</span>
  </div>

  {/* Mobile filter Sheet */}
  <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
    <SheetContent side="left" className="...">
      <Filters ... onChange={setFilters} />
    </SheetContent>
  </Sheet>

  {/* Content: cards on mobile, table on desktop */}
  <div className="flex-1 overflow-auto">
    <div className="grid grid-cols-1 gap-2 p-3 md:hidden">
      {rows.map((e) => <EventCard key={e.id} event={e} onClick={() => setSelectedId(e.id)} />)}
    </div>
    <Table className="hidden md:table">
      {/* existing table */}
    </Table>
  </div>
  <EventDetailPanel ... />
</div>
```

### 5. `src/components/top-nav.tsx` — hide version label below sm

One line change:
```tsx
<span className="hidden sm:inline-block font-mono text-[10px] ...">local · v0</span>
```

Frees up ~50px on narrow phones.

### 6. `src/components/event-detail-body.tsx` — touch-friendly tap targets

- Tags + sensor/witness pills: bump `px-1.5 py-0.5` to `px-2 py-1` so they're ≥32px tall after font scaling.
- The "Full document text" `<CollapsibleTrigger>` is already wide-and-tall enough.

### 7. `src/components/event-detail-inline.tsx` — defensive guard

Currently rendered unconditionally inside MapView. After step 2's branch, it only renders on `md:+`. No code change needed if step 2 is done. Note in comments.

### 8. `src/app/connections/connections-client.tsx` — touch sweep

- The tag pills (`px-2 py-0.5`) are borderline small for touch. Bump to `px-2.5 py-1`.
- "EVENTS MATCHING ALL" header on mobile: above the results in single column, already responsive.

### 9. (Skip) Hamburger menu

NOT doing this. 4 nav links fit horizontally with version label hidden. Adds complexity for no real benefit.

---

## Implementation order

**Sprint 8 — Mobile polish — ~2.5-3h**

1. **`src/lib/use-media-query.ts`** — new file, ~15 min.
2. **`src/components/map-view.tsx`** — branch panel + bigger pins. ~40 min. Smoke test on devtools mobile view at 375px.
3. **`src/components/off-map-drawer.tsx`** — responsive classes for top-left desktop → bottom-strip mobile. ~30 min.
4. **`src/components/browse-table.tsx`** — toolbar + filter Sheet + card grid. ~50 min.
5. **`src/components/top-nav.tsx`** — hide version label on `<sm:`. ~5 min.
6. **`src/components/event-detail-body.tsx`** — pill padding bump for tap targets. ~10 min.
7. **`src/app/connections/connections-client.tsx`** — pill padding bump. ~5 min.
8. **Smoke test loop**: Chrome devtools "Toggle device toolbar" at iPhone 14 width (390px) and iPhone SE width (375px). Verify each page. ~20 min.

Total: ~2.5-3h. Single sprint.

---

## Acceptance criteria

- [ ] Open `/map` at 375px → map fills the screen, off-map drawer is a tappable strip along the bottom, tap a pin → fullscreen Sheet slides up with detail body
- [ ] Tap another pin → Sheet content swaps (no need to close)
- [ ] Pin tap targets feel responsive — not requiring pixel-perfect aim
- [ ] Open `/browse` at 375px → "Filters (0)" button visible top-left; tap → filter Sheet slides in; tap event card → fullscreen detail Sheet
- [ ] Open `/connections` at 375px → tag picker on top, results below; tap any result → fullscreen Sheet
- [ ] EN/中文 toggle visible and tappable on all pages at 375px
- [ ] No horizontal scroll on any page at 375px (except deliberate ones like Timeline year-cards)
- [ ] No content cropping or off-screen elements

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `useMediaQuery` hydration mismatch on mobile first-paint | Hook starts with `matches=false` and `mounted=false`, sets real value in `useEffect`. Brief 1-frame flicker on mobile first-paint where map renders without a panel; acceptable. No mismatch warning. |
| Leaflet's `invalidateSize()` doesn't fire when viewport rotates from portrait to landscape | The existing `useEffect` for window resize already calls it. Verify in smoke test. |
| Sheet on `/browse` mobile conflicts with the existing detail panel Sheet (two Sheets stacked) | Radix Sheet is portal-rendered; multiple instances allowed. But UX-wise, opening detail while filter Sheet is open is weird. Auto-close filter Sheet when an event card is tapped. |
| `EventCard` width is `w-72` (288px) which is wider than 375px viewport when padding is added | Card uses `w-72 shrink-0` for the horizontal-scroll case on Timeline. In the new Browse vertical stack, swap class to `w-full max-w-md` so it fills the column. |
| The bottom off-map drawer overlap with iOS Safari's URL bar | Add `pb-safe` if necessary; usually `inset-x-0 bottom-0` on a fixed element is handled correctly by Safari. |

---

## What's intentionally not in scope

- **Native app feel** (bottom tab bar, swipe gestures, etc.) — out of scope. Stick with sticky-top-nav + Sheet patterns.
- **Pin clustering on the map** — at current data density (~17 unique coords post-jitter) clustering isn't needed.
- **Reduced data per card on mobile** — keep bust + cover-up pills. They're the value.
- **Image lazy-loading for thumbnails** — only some events have `thumbnail_url`, already deferred via `<a target="_blank">`.
- **Server-side responsive HTML** (different markup for mobile) — overkill. CSS-driven branching is enough.

---

## After Sprint 8 — what changes for Sprint 7 (Vercel)

Nothing structurally. Sprint 7 plan still applies. The new files added by Sprint 8 (use-media-query.ts and the responsive component variants) get bundled into the static build like any other client component. No deployment concerns.

If anything, Sprint 8 *helps* Sprint 7 because the test surface for the Vercel deploy is "phone visitors view the site" — Sprint 8 is what makes that test pass.

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `n/a` — single-developer plan, no multi-model analysis
- GEMINI_SESSION: `n/a`

---

## File checklist (every file touched when this sprint runs)

```
src/lib/use-media-query.ts                          # NEW
src/components/map-view.tsx                         # branch panel by viewport, bigger pins
src/components/off-map-drawer.tsx                   # responsive classes — top-left desktop, bottom-strip mobile
src/components/browse-table.tsx                     # mobile toolbar + filter Sheet + card grid
src/components/top-nav.tsx                          # hide version label below sm
src/components/event-detail-body.tsx                # bump pill padding for touch
src/app/connections/connections-client.tsx         # bump tag-pill padding for touch
```
