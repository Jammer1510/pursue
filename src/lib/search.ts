import MiniSearch from "minisearch";
import type { EventFilters, EventSummary } from "./types";

export interface EventSearchDocument {
  id: number;
  title: string | null;
  title_zh: string | null;
  summary: string | null;
  summary_zh: string | null;
  incident_location: string | null;
  incident_location_zh: string | null;
  bust_reasoning: string | null;
  bust_reasoning_zh: string | null;
  claims: string;
  claims_zh: string;
}

function getYear(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function matchesStructuredFilters(event: EventSummary, filters: EventFilters): boolean {
  if (filters.agencies?.length && (!event.agency || !filters.agencies.includes(event.agency))) return false;
  if (
    filters.documentTypes?.length &&
    (!event.document_type || !filters.documentTypes.includes(event.document_type))
  ) {
    return false;
  }

  if (typeof filters.yearMin === "number") {
    const year = getYear(event.incident_date_max ?? event.incident_date_min ?? event.incident_date);
    if (year !== null && year < filters.yearMin) return false;
  }
  if (typeof filters.yearMax === "number") {
    const year = getYear(event.incident_date_min ?? event.incident_date);
    if (year !== null && year > filters.yearMax) return false;
  }
  if (typeof filters.bustMin === "number" && event.bust_score !== null && event.bust_score < filters.bustMin) {
    return false;
  }
  if (typeof filters.bustMax === "number" && event.bust_score !== null && event.bust_score > filters.bustMax) {
    return false;
  }
  return true;
}

function fallbackTextMatches(event: EventSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [
    event.title,
    event.title_zh,
    event.incident_location,
    event.incident_location_zh,
    event.agency,
    event.document_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => text.includes(token));
}

export function createEventSearchIndex(docs: EventSearchDocument[]): MiniSearch<EventSearchDocument> {
  const index = new MiniSearch<EventSearchDocument>({
    fields: [
      "title",
      "title_zh",
      "summary",
      "summary_zh",
      "incident_location",
      "incident_location_zh",
      "bust_reasoning",
      "bust_reasoning_zh",
      "claims",
      "claims_zh",
    ],
    storeFields: ["id"],
    searchOptions: {
      boost: { title: 3, title_zh: 3, incident_location: 2, incident_location_zh: 2, claims: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  index.addAll(docs);
  return index;
}

export function filterEventsClient(
  events: EventSummary[],
  filters: EventFilters,
  index: MiniSearch<EventSearchDocument> | null
): EventSummary[] {
  const structured = events.filter((event) => matchesStructuredFilters(event, filters));
  const query = filters.search?.trim();
  if (!query) return structured;

  if (!index) return structured.filter((event) => fallbackTextMatches(event, query));

  const matches = new Set(index.search(query).map((result) => result.id));
  return structured.filter((event) => matches.has(event.id));
}
