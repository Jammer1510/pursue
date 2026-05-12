import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { EventFilters, EventLocation, EventRecord, EventSummary } from "./types";
import type { TagAggregate } from "./queries-sqlite";

type Mode = "json" | "sqlite";

interface DataSource {
  getEventById(id: number): EventRecord | null;
  getEventLocations(eventId: number): EventLocation[];
  getAllEventLocations(): EventLocation[];
  getAllEventSummaries(): EventSummary[];
  searchEvents(filters: EventFilters): EventSummary[];
  getDistinctAgencies(): string[];
  getDistinctDocumentTypes(): string[];
  getTagAggregates(): TagAggregate[];
  getEventsByTagIntersection(tags: Array<{ category: string; tag: string }>): EventSummary[];
  getEventCount(): number;
}

const mode: Mode =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "json" || process.env.VERCEL ? "json" : "sqlite";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const require = createRequire(import.meta.url);
const eventCache = new Map<number, EventRecord | null>();

let summariesCache: EventSummary[] | null = null;
let locationsCache: EventLocation[] | null = null;
let tagsCache: TagAggregate[] | null = null;

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf8")) as T;
}

function summaries(): EventSummary[] {
  summariesCache ??= readJson<EventSummary[]>("summaries.json");
  return summariesCache;
}

function locations(): EventLocation[] {
  locationsCache ??= readJson<EventLocation[]>("locations.json");
  return locationsCache;
}

function tags(): TagAggregate[] {
  tagsCache ??= readJson<TagAggregate[]>("tags.json");
  return tagsCache;
}

function eventById(id: number): EventRecord | null {
  if (eventCache.has(id)) return eventCache.get(id) ?? null;
  try {
    const event = readJson<EventRecord>(`events/${id}.json`);
    eventCache.set(id, event);
    return event;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (code !== "ENOENT") throw error;
    eventCache.set(id, null);
    return null;
  }
}

function yearMin(event: EventSummary): number | null {
  const raw = event.incident_date_min ?? event.incident_date;
  if (!raw) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function yearMax(event: EventSummary): number | null {
  const raw = event.incident_date_max ?? event.incident_date_min ?? event.incident_date;
  if (!raw) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function textMatches(event: EventSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const full = eventById(event.id);
  const haystack = [
    event.title,
    event.title_zh,
    event.incident_location,
    event.incident_location_zh,
    full?.summary,
    full?.summary_zh,
    full?.bust_reasoning,
    full?.bust_reasoning_zh,
    full?.claims.join(" "),
    full?.claims_zh.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

function filterSummaries(filters: EventFilters): EventSummary[] {
  return summaries()
    .filter((event) => {
      if (filters.agencies?.length && (!event.agency || !filters.agencies.includes(event.agency))) return false;
      if (
        filters.documentTypes?.length &&
        (!event.document_type || !filters.documentTypes.includes(event.document_type))
      ) {
        return false;
      }
      if (typeof filters.yearMin === "number") {
        const year = yearMax(event);
        if (year !== null && year < filters.yearMin) return false;
      }
      if (typeof filters.yearMax === "number") {
        const year = yearMin(event);
        if (year !== null && year > filters.yearMax) return false;
      }
      if (typeof filters.bustMin === "number" && event.bust_score !== null && event.bust_score < filters.bustMin) {
        return false;
      }
      if (typeof filters.bustMax === "number" && event.bust_score !== null && event.bust_score > filters.bustMax) {
        return false;
      }
      if (filters.search && !textMatches(event, filters.search)) return false;
      return true;
    })
    .slice(0, 500);
}

function getSqliteSource(): DataSource {
  return require("./queries-sqlite") as DataSource;
}

const jsonSource: DataSource = {
  getEventById: eventById,
  getEventLocations(eventId) {
    return locations().filter((location) => location.event_id === eventId);
  },
  getAllEventLocations: locations,
  getAllEventSummaries: summaries,
  searchEvents: filterSummaries,
  getDistinctAgencies() {
    return [...new Set(summaries().map((event) => event.agency).filter((agency): agency is string => Boolean(agency)))]
      .sort();
  },
  getDistinctDocumentTypes() {
    return [
      ...new Set(
        summaries()
          .map((event) => event.document_type)
          .filter((documentType): documentType is string => Boolean(documentType))
      ),
    ].sort();
  },
  getTagAggregates: tags,
  getEventsByTagIntersection(selectedTags) {
    if (!selectedTags.length) return [];
    const selected = new Set(selectedTags.map((tag) => `${tag.category}:${tag.tag}`));
    return summaries().filter((summary) => {
      const event = eventById(summary.id);
      if (!event) return false;
      const eventTags = new Set(event.tags.map((tag) => `${tag.category}:${tag.tag}`));
      for (const tag of selected) {
        if (!eventTags.has(tag)) return false;
      }
      return true;
    });
  },
  getEventCount() {
    return summaries().length;
  },
};

export const dataSource: DataSource = mode === "json" ? jsonSource : getSqliteSource();
export const DATA_SOURCE_MODE = mode;
export type { TagAggregate };
