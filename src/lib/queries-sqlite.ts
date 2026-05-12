import { getDb } from "./db";
import type { EventRecord, EventSummary, EventFilters, EventLocation, EventTag } from "./types";

export function getEventById(id: number): EventRecord | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as
    | Omit<
        EventRecord,
        | "claims" | "sensors" | "witnesses" | "bust_explanations" | "locations"
        | "cover_up_indicators" | "claims_zh" | "bust_explanations_zh" | "cover_up_indicators_zh" | "tags"
      >
    | undefined;
  if (!row) return null;
  const claimRows = db
    .prepare(`SELECT claim, claim_zh FROM event_claims WHERE event_id = ? ORDER BY position`)
    .all(id) as Array<{ claim: string; claim_zh: string | null }>;
  const claims = claimRows.map((r) => r.claim);
  const claims_zh = claimRows.map((r) => r.claim_zh ?? "");
  const sensors = (
    db.prepare(`SELECT modality FROM event_sensors WHERE event_id = ?`).all(id) as Array<{ modality: string }>
  ).map((r) => r.modality);
  const witnesses = (
    db.prepare(`SELECT descriptor FROM event_witnesses WHERE event_id = ?`).all(id) as Array<{ descriptor: string }>
  ).map((r) => r.descriptor);
  const bustRows = db
    .prepare(`SELECT explanation, explanation_zh FROM event_bust_explanations WHERE event_id = ? ORDER BY rank`)
    .all(id) as Array<{ explanation: string; explanation_zh: string | null }>;
  const bust_explanations = bustRows.map((r) => r.explanation);
  const bust_explanations_zh = bustRows.map((r) => r.explanation_zh ?? "");
  const cuRows = db
    .prepare(`SELECT indicator, indicator_zh FROM event_cover_up_indicators WHERE event_id = ? ORDER BY rank`)
    .all(id) as Array<{ indicator: string; indicator_zh: string | null }>;
  const cover_up_indicators = cuRows.map((r) => r.indicator);
  const cover_up_indicators_zh = cuRows.map((r) => r.indicator_zh ?? "");
  const tags = db
    .prepare(`SELECT category, tag FROM event_tags WHERE event_id = ? ORDER BY category, tag`)
    .all(id) as EventTag[];
  const locations = getEventLocations(id);
  return {
    ...row,
    claims,
    claims_zh,
    sensors,
    witnesses,
    bust_explanations,
    bust_explanations_zh,
    cover_up_indicators,
    cover_up_indicators_zh,
    tags,
    locations,
  } as EventRecord;
}

export function getEventLocations(eventId: number): EventLocation[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, event_id, position, location_text, latitude, longitude, geocode_source, kind
       FROM event_locations WHERE event_id = ? ORDER BY position ASC`
    )
    .all(eventId) as EventLocation[];
}

export function getAllEventLocations(): EventLocation[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, event_id, position, location_text, latitude, longitude, geocode_source, kind
       FROM event_locations ORDER BY event_id ASC, position ASC`
    )
    .all() as EventLocation[];
}

export function getAllEventSummaries(): EventSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, folder_name, title, agency,
              incident_date, incident_date_min, incident_date_max,
              incident_location, document_type, bust_score, cover_up_score,
              latitude, longitude, source_url,
              title_zh, incident_location_zh
       FROM events
       ORDER BY COALESCE(incident_date, incident_date_min, '9999') ASC, id ASC`
    )
    .all() as EventSummary[];
}

export function searchEvents(f: EventFilters): EventSummary[] {
  const db = getDb();
  const where: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];

  if (f.agencies && f.agencies.length) {
    where.push(`e.agency IN (${f.agencies.map(() => "?").join(",")})`);
    params.push(...f.agencies);
  }
  if (f.documentTypes && f.documentTypes.length) {
    where.push(`e.document_type IN (${f.documentTypes.map(() => "?").join(",")})`);
    params.push(...f.documentTypes);
  }
  if (typeof f.yearMin === "number") {
    where.push(`(substr(COALESCE(e.incident_date, e.incident_date_min, ''), 1, 4) >= ?)`);
    params.push(String(f.yearMin));
  }
  if (typeof f.yearMax === "number") {
    where.push(`(substr(COALESCE(e.incident_date, e.incident_date_max, e.incident_date_min, ''), 1, 4) <= ?)`);
    params.push(String(f.yearMax));
  }
  if (typeof f.bustMin === "number") {
    where.push(`(e.bust_score >= ? OR e.bust_score IS NULL)`);
    params.push(f.bustMin);
  }
  if (typeof f.bustMax === "number") {
    where.push(`(e.bust_score <= ? OR e.bust_score IS NULL)`);
    params.push(f.bustMax);
  }

  let sql = `SELECT e.id, e.folder_name, e.title, e.agency,
                    e.incident_date, e.incident_date_min, e.incident_date_max,
                    e.incident_location, e.document_type, e.bust_score, e.cover_up_score,
                    e.latitude, e.longitude, e.source_url,
                    e.title_zh, e.incident_location_zh
             FROM events e`;

  if (f.search && f.search.trim()) {
    sql += ` JOIN events_fts ON events_fts.rowid = e.id AND events_fts MATCH ?`;
    params.unshift(escapeFts(f.search.trim()));
  }
  if (where.length) sql += ` WHERE ` + where.join(" AND ");
  sql += ` ORDER BY COALESCE(e.incident_date, e.incident_date_min, '9999') ASC, e.id ASC LIMIT 500`;

  return db.prepare(sql).all(...params) as EventSummary[];
}

function escapeFts(q: string): string {
  const tokens = q.replace(/"/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

export function getDistinctAgencies(): string[] {
  const db = getDb();
  return (
    db.prepare(`SELECT DISTINCT agency FROM events WHERE agency IS NOT NULL ORDER BY agency`).all() as Array<{
      agency: string;
    }>
  ).map((r) => r.agency);
}

export function getDistinctDocumentTypes(): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT DISTINCT document_type FROM events WHERE document_type IS NOT NULL ORDER BY document_type`)
      .all() as Array<{ document_type: string }>
  ).map((r) => r.document_type);
}

export interface TagAggregate {
  category: string;
  tag: string;
  count: number;
}

export function getTagAggregates(): TagAggregate[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT category, tag, COUNT(DISTINCT event_id) AS count
       FROM event_tags
       GROUP BY category, tag
       ORDER BY category ASC, count DESC, tag ASC`
    )
    .all() as TagAggregate[];
}

export function getEventsByTagIntersection(tags: Array<{ category: string; tag: string }>): EventSummary[] {
  if (!tags.length) return [];
  const db = getDb();
  const placeholders = tags.map(() => "(?, ?)").join(",");
  const params: string[] = [];
  for (const t of tags) { params.push(t.category, t.tag); }
  const sql = `
    SELECT e.id, e.folder_name, e.title, e.agency,
           e.incident_date, e.incident_date_min, e.incident_date_max,
           e.incident_location, e.document_type, e.bust_score, e.cover_up_score,
           e.latitude, e.longitude, e.source_url,
           e.title_zh, e.incident_location_zh
    FROM events e
    JOIN event_tags t ON t.event_id = e.id
    WHERE (t.category, t.tag) IN (VALUES ${placeholders})
    GROUP BY e.id
    HAVING COUNT(DISTINCT t.category || ':' || t.tag) = ?
    ORDER BY COALESCE(e.incident_date, e.incident_date_min, '9999') ASC, e.id ASC
  `;
  return db.prepare(sql).all(...params, tags.length) as EventSummary[];
}

export function getEventCount(): number {
  const db = getDb();
  const r = db.prepare(`SELECT COUNT(*) AS c FROM events`).get() as { c: number };
  return r.c;
}
