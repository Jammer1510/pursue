import Database, { type Database as DB } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id                          INTEGER PRIMARY KEY,
  folder_name                 TEXT NOT NULL UNIQUE,
  dataset_row                 INTEGER,
  source_title                TEXT,
  source_url                  TEXT,
  thumbnail_url               TEXT,
  pdf_local_path              TEXT,
  release_date                TEXT,
  description_blurb           TEXT,
  title                       TEXT,
  agency                      TEXT,
  incident_date               TEXT,
  incident_date_min           TEXT,
  incident_date_max           TEXT,
  incident_location           TEXT,
  document_type               TEXT,
  summary                     TEXT,
  reported_object_description TEXT,
  reported_behavior           TEXT,
  official_resolution         TEXT,
  bust_score                  INTEGER,
  bust_reasoning              TEXT,
  latitude                    REAL,
  longitude                   REAL,
  geocode_source              TEXT,
  full_text                   TEXT,
  page_count                  INTEGER,
  was_truncated               INTEGER NOT NULL DEFAULT 0,
  llm_model_metadata          TEXT,
  llm_model_bust              TEXT,
  ingested_at                 TEXT NOT NULL,
  metadata_hash               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_claims (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  claim     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_event ON event_claims(event_id);

CREATE TABLE IF NOT EXISTS event_sensors (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  modality  TEXT NOT NULL,
  PRIMARY KEY (event_id, modality)
);

CREATE TABLE IF NOT EXISTS event_witnesses (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  descriptor  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_witnesses_event ON event_witnesses(event_id);

CREATE TABLE IF NOT EXISTS event_bust_explanations (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rank         INTEGER NOT NULL,
  explanation  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_locations (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  location_text   TEXT NOT NULL,
  latitude        REAL,
  longitude       REAL,
  geocode_source  TEXT,
  kind            TEXT NOT NULL DEFAULT 'terrestrial'
);
CREATE INDEX IF NOT EXISTS idx_event_locations_event ON event_locations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_locations_kind  ON event_locations(kind);

CREATE INDEX IF NOT EXISTS idx_events_date     ON events(incident_date);
CREATE INDEX IF NOT EXISTS idx_events_date_min ON events(incident_date_min);
CREATE INDEX IF NOT EXISTS idx_events_agency   ON events(agency);
CREATE INDEX IF NOT EXISTS idx_events_bust     ON events(bust_score);
CREATE INDEX IF NOT EXISTS idx_events_doctype  ON events(document_type);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title, summary, incident_location, claims_blob,
  content='events', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, summary, incident_location, claims_blob)
  VALUES (new.id, new.title, new.summary, new.incident_location, '');
END;
CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, summary, incident_location, claims_blob)
  VALUES ('delete', old.id, old.title, old.summary, old.incident_location, '');
END;
CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, summary, incident_location, claims_blob)
  VALUES ('delete', old.id, old.title, old.summary, old.incident_location, '');
  INSERT INTO events_fts(rowid, title, summary, incident_location, claims_blob)
  VALUES (new.id, new.title, new.summary, new.incident_location, '');
END;

CREATE TABLE IF NOT EXISTS event_embeddings (
  event_id   INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  embedding  BLOB NOT NULL,
  model      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_tags (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category  TEXT NOT NULL,
  tag       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag   ON event_tags(category, tag);

CREATE TABLE IF NOT EXISTS event_cover_up_indicators (
  id         INTEGER PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rank       INTEGER NOT NULL,
  indicator  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_coverup_event ON event_cover_up_indicators(event_id);
`;

const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "events", column: "cover_up_score",                   ddl: "INTEGER" },
  { table: "events", column: "cover_up_reasoning",               ddl: "TEXT" },
  { table: "events", column: "title_zh",                         ddl: "TEXT" },
  { table: "events", column: "summary_zh",                       ddl: "TEXT" },
  { table: "events", column: "reported_object_description_zh",   ddl: "TEXT" },
  { table: "events", column: "reported_behavior_zh",             ddl: "TEXT" },
  { table: "events", column: "official_resolution_zh",           ddl: "TEXT" },
  { table: "events", column: "bust_reasoning_zh",                ddl: "TEXT" },
  { table: "events", column: "cover_up_reasoning_zh",            ddl: "TEXT" },
  { table: "events", column: "incident_location_zh",             ddl: "TEXT" },
  { table: "event_claims",              column: "claim_zh",        ddl: "TEXT" },
  { table: "event_bust_explanations",   column: "explanation_zh",  ddl: "TEXT" },
  { table: "event_cover_up_indicators", column: "indicator_zh",    ddl: "TEXT" },
];

function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function runMigrations(db: DB): void {
  for (const m of COLUMN_MIGRATIONS) ensureColumn(db, m.table, m.column, m.ddl);
}

let cached: DB | null = null;

export function getDbPath(): string {
  return path.resolve(process.cwd(), "data", "pursue.db");
}

export function getDb(): DB {
  if (cached) return cached;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  runMigrations(db);
  cached = db;
  return db;
}

export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}

// Refresh FTS row's claims_blob after writing event_claims (since FTS triggers
// only fire on the events table, claims need a manual sync).
export function refreshFtsClaims(db: DB, eventId: number): void {
  const claims = db
    .prepare(`SELECT claim FROM event_claims WHERE event_id = ? ORDER BY position`)
    .all(eventId) as Array<{ claim: string }>;
  const blob = claims.map((r) => r.claim).join(" ");
  db.prepare(
    `INSERT INTO events_fts(events_fts, rowid, title, summary, incident_location, claims_blob)
     VALUES ('delete',
             ?,
             (SELECT title FROM events WHERE id=?),
             (SELECT summary FROM events WHERE id=?),
             (SELECT incident_location FROM events WHERE id=?),
             '')`
  ).run(eventId, eventId, eventId, eventId);
  db.prepare(
    `INSERT INTO events_fts(rowid, title, summary, incident_location, claims_blob)
     VALUES (?,
             (SELECT title FROM events WHERE id=?),
             (SELECT summary FROM events WHERE id=?),
             (SELECT incident_location FROM events WHERE id=?),
             ?)`
  ).run(eventId, eventId, eventId, eventId, blob);
}
