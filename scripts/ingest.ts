#!/usr/bin/env tsx
/**
 * PURSUE UAP files ingestion.
 * Walks ${UFO_USA_PATH}/converted/, parses page-*.md, cross-references
 * metadata/uap-csv.csv as ground truth, calls Gemini for metadata + bust
 * assessment, writes to data/pursue.db.
 *
 * Flags: --force --only <list> --limit <n> --dry-run --no-bust --no-llm --skip-text
 * Usage: GEMINI_API_KEY=... npx tsx scripts/ingest.ts --only 001,035,112,116,120 --force
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import Papa from "papaparse";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import cliProgress from "cli-progress";
import { getDb, refreshFtsClaims, closeDb } from "../src/lib/db";

const ROOT = process.cwd();
const UFO_USA_PATH = path.resolve(ROOT, process.env.UFO_USA_PATH || "../UFO-USA");
const CONVERTED_DIR = path.join(UFO_USA_PATH, "converted");
const CSV_PATH = path.join(UFO_USA_PATH, "metadata", "uap-csv.csv");
const GEOCODING_PATH = path.join(ROOT, "data", "geocoding.json");
const ERRORS_PATH = path.join(ROOT, "data", "ingest-errors.jsonl");

const TRUNCATE_CHARS = 30_000;
const BUST_TRUNCATE_CHARS = 20_000;
const SLEEP_MS = 500;
const METADATA_MODEL = "gemini-2.5-flash";
const BUST_MODEL = "gemini-2.5-flash";
const TRANSLATION_MODEL = "gemini-2.5-flash";

interface Flags {
  force: boolean;
  only: string[] | null;
  limit: number | null;
  dryRun: boolean;
  noBust: boolean;
  noLlm: boolean;
  noTranslate: boolean;
  skipText: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { force: false, only: null, limit: null, dryRun: false, noBust: false, noLlm: false, noTranslate: false, skipText: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") f.force = true;
    else if (a === "--dry-run") f.dryRun = true;
    else if (a === "--no-bust") f.noBust = true;
    else if (a === "--no-llm") f.noLlm = true;
    else if (a === "--no-translate") f.noTranslate = true;
    else if (a === "--skip-text") f.skipText = true;
    else if (a === "--only") f.only = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--limit") f.limit = parseInt(argv[++i] || "0", 10) || null;
  }
  return f;
}

interface CsvRow {
  releaseDate: string; title: string; type: string; descriptionBlurb: string;
  agency: string; incidentDate: string; incidentLocation: string;
  pdfLink: string; modalImage: string;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function loadCsv(): Map<string, CsvRow> {
  if (!fs.existsSync(CSV_PATH)) { console.warn(`[csv] not found at ${CSV_PATH}`); return new Map(); }
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, CsvRow>();
  for (const r of parsed.data) {
    const title = (r["Title"] || "").trim().replace(/\s+/g, " ");
    if (!title) continue;
    map.set(normalizeTitle(title), {
      releaseDate: (r["Release Date"] || "").trim(),
      title,
      type: (r["Type"] || "").trim(),
      descriptionBlurb: (r["Description Blurb"] || "").trim(),
      agency: (r["Agency"] || "").trim(),
      incidentDate: (r["Incident Date"] || "").trim(),
      incidentLocation: (r["Incident Location"] || "").trim(),
      pdfLink: (r["PDF | Image Link"] || "").trim(),
      modalImage: (r["Modal Image"] || "").trim(),
    });
  }
  return map;
}

interface GeocodeEntry { lat: number; lng: number; source: string; precision?: "vague"; }
let GEOCODE_MAP: Record<string, GeocodeEntry> | null = null;
function loadGeocode(): Record<string, GeocodeEntry> {
  if (GEOCODE_MAP) return GEOCODE_MAP;
  const raw = JSON.parse(fs.readFileSync(GEOCODING_PATH, "utf8"));
  delete raw._README;
  GEOCODE_MAP = raw as Record<string, GeocodeEntry>;
  return GEOCODE_MAP;
}
function geocode(loc: string | null): GeocodeEntry | null {
  return geocodeMatch(loc)?.entry ?? null;
}
function geocodeMatch(loc: string | null): { entry: GeocodeEntry; exact: boolean } | null {
  if (!loc) return null;
  const map = loadGeocode();
  const norm = loc.trim().toLowerCase();
  if (map[norm]) return { entry: map[norm], exact: true };
  let bestKey: string | null = null;
  for (const key of Object.keys(map)) {
    if (norm.includes(key) || key.includes(norm)) {
      if (bestKey === null || key.length > bestKey.length) bestKey = key;
    }
  }
  return bestKey ? { entry: map[bestKey], exact: false } : null;
}

const OFF_EARTH_PATTERNS = [
  /^moon$/i,
  /^lunar$/i,
  /^lunar surface$/i,
  /^low earth orbit$/i,
  /^leo$/i,
  /^orbit$/i,
  /^earth orbit$/i,
];
const UNKNOWN_TOKENS = new Set(["unknown", "n/a", "na", "none", "undisclosed", "redacted"]);

type LocationKind = "terrestrial" | "off-earth" | "unknown";
interface ParsedLocation { text: string; kind: LocationKind; geo: GeocodeEntry | null; }

function parseLocations(raw: string | null): ParsedLocation[] {
  if (!raw) return [];
  const chunks = raw.split(";").map((s) => s.trim()).filter(Boolean);
  if (!chunks.length) return [];
  return chunks.map((chunk) => {
    const low = chunk.toLowerCase();
    if (OFF_EARTH_PATTERNS.some((r) => r.test(chunk))) return { text: chunk, kind: "off-earth" as const, geo: null };
    if (UNKNOWN_TOKENS.has(low)) return { text: chunk, kind: "unknown" as const, geo: null };
    const match = geocodeMatch(chunk);
    if (match?.entry.precision === "vague" && match.exact) {
      return { text: chunk, kind: "unknown" as const, geo: null };
    }
    return { text: chunk, kind: "terrestrial" as const, geo: match?.entry ?? null };
  });
}

interface FolderContent { folder: string; pages: number; fullText: string; truncated: boolean; frontmatter: Record<string, unknown>; }
function listFolders(only: string[] | null): string[] {
  const all = fs.readdirSync(CONVERTED_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (!only || only.length === 0) return all;
  return all.filter((name) => only.some((prefix) => name.startsWith(prefix)));
}
function readFolder(folder: string): FolderContent {
  const dir = path.join(CONVERTED_DIR, folder);
  const pages = fs.readdirSync(dir).filter((f) => /^page-\d+\.md$/.test(f)).sort();
  const parts: string[] = [];
  let frontmatter: Record<string, unknown> = {};
  for (const p of pages) {
    const raw = fs.readFileSync(path.join(dir, p), "utf8");
    const m = matter(raw);
    if (Object.keys(frontmatter).length === 0) frontmatter = m.data;
    parts.push(m.content);
  }
  let fullText = parts.join("\n\n").trim();
  let truncated = false;
  if (fullText.length > TRUNCATE_CHARS) { fullText = fullText.slice(0, TRUNCATE_CHARS); truncated = true; }
  return { folder, pages: pages.length, fullText, truncated, frontmatter };
}

const METADATA_SYSTEM = `You are extracting structured metadata from a declassified UAP/UFO document.
You may be given partial ground-truth values from the official war.gov release CSV — when those are present, do not contradict them; just fill in the gaps. If a field cannot be inferred from the document, return null. Be terse and factual; do not speculate beyond what the text supports.`;

function buildMetadataPrompt(args: { folder: string; csvRow: CsvRow | null; fullText: string; }): string {
  const csv = args.csvRow;
  const truth = csv
    ? `GROUND-TRUTH FROM OFFICIAL CSV (do not contradict):
- title hint: ${csv.title}
- agency: ${csv.agency || "unknown"}
- incident_date: ${csv.incidentDate && csv.incidentDate !== "N/A" ? csv.incidentDate : "unknown"}
- incident_location: ${csv.incidentLocation && csv.incidentLocation !== "N/A" ? csv.incidentLocation : "unknown"}
- official blurb: ${csv.descriptionBlurb || "(none)"}
`
    : "GROUND-TRUTH FROM CSV: (no matching CSV row)\n";
  return `${truth}

DOCUMENT FOLDER: ${args.folder}

DOCUMENT TEXT (truncated to ${TRUNCATE_CHARS} chars; redactions appear as ~~strikethrough~~ or [bracket codes]):
---
${args.fullText.slice(0, TRUNCATE_CHARS)}
---

Extract the metadata. If incident_date is a range (e.g. an FBI case file spanning 1947-1968), set incident_date_min and incident_date_max instead of incident_date. For a point date, use incident_date in ISO 8601 (YYYY-MM-DD).

If the document is purely administrative (case-file index, FOIA boilerplate, photo metadata sheet) with no observation narrative, set document_type to "photo_metadata" or "other" and leave reported_object_description / reported_behavior null.

Also extract descriptive tags into the "tags" object. Five categories — object / behavior / shape / color / theme. Use lowercase hyphenated tokens grounded in the document text. Prefer "gold" over "gold-colored", "disc" over "disc-shaped", "instant-acceleration" over "very fast acceleration". Do NOT invent tags that the text doesn't directly support. Keep each category short (0-5 tags). Themes capture cross-cutting patterns: "multi-sensor", "humanoid-witness", "military-engagement", "redacted-followup", "diplomatic-cable", "mass-sighting", "near-miss", "photo-evidence".`;
}

const BUST_SYSTEM = `You are an honest UAP analyst. You are NOT a believer and NOT a debunker — you score what the document actually supports. Two independent scores are required for each document: bust_score (how mundane) and cover_up_score (how much concealment is evident).

The PURSUE release contains everything from obvious Starlink misIDs to multi-sensor military encounters. Distinguish them honestly. Do NOT default to "probably mundane" just because that is the safe answer. If the document itself does NOT name a specific prosaic source AND multiple independent sensors (e.g. radar AND FLIR AND visual) report convergent kinematics, that is genuine signal — score below 50.

Bust_score calibration anchors (neutral = 50):
- 85-100: document itself names a mundane source (acknowledged balloon, identified drone, confirmed misID after investigation), OR single low-quality grainy image with no kinematics and no corroborating witnesses
- 65-84:  modest evidence pointing toward a typical prosaic explanation (Starlink train, weather balloon, lens flare, distant aircraft) and no features that resist that explanation
- 35-64:  genuinely uncertain — unusual features present but a mundane explanation remains plausible without the document ruling it out
- 15-34:  multi-sensor OR multi-witness convergence with at least one feature (kinematics, signature, persistence, mass-sighting) that resists easy explanation
- 0-14:   multi-sensor + multi-witness + behavior incompatible with known craft (instantaneous high-G turns across radar AND IR AND visual; documented sub-second acceleration; mass simultaneous sightings across hundreds of km)

Cover_up_score is INDEPENDENT of bust_score. A document can be mundane-but-heavily-concealed (high bust + high cover-up) or anomalous-and-openly-reported (low bust + low cover-up).
- 0-19:   no concealment evident
- 20-49:  routine redaction of names/handles only; standard FOIA boilerplate
- 50-79:  substantial concealment: classified follow-ups referenced, sentence-level black-bar redaction across multiple pages, key witness names withheld, internal contradictions with public statements
- 80-100: extreme concealment: classified Annex referenced but not released, >50% of pages heavily redacted, language indicating witness intimidation or compartmented access, public statements contradicting the internal record

If the document is a photo metadata sheet or purely administrative (no observation narrative), return bust_score=null, bust_explanations=[], cover_up_score=null, cover_up_indicators=[], with reasoning explaining why it is not assessable.`;

function buildBustPrompt(args: { folder: string; meta: MetadataResult; fullText: string; }): string {
  const m = args.meta;
  return `DOCUMENT METADATA:
- Title: ${m.title || "(unknown)"}
- Agency: ${m.agency || "(unknown)"}
- Incident date: ${m.incident_date || (m.incident_date_min ? `${m.incident_date_min}..${m.incident_date_max ?? "?"}` : "unknown")}
- Location: ${m.incident_location || "unknown"}
- Document type: ${m.document_type || "unknown"}
- Sensor modalities: ${(m.sensor_modalities ?? []).join(", ") || "none reported"}
- Witnesses: ${(m.witnesses ?? []).join("; ") || "none reported"}
- Object description: ${m.reported_object_description || "not described"}
- Behavior: ${m.reported_behavior || "not described"}

FULL DOCUMENT TEXT (truncated to ${BUST_TRUNCATE_CHARS} chars; redactions appear as ~~strikethrough~~ or [bracket codes]):
---
${args.fullText.slice(0, BUST_TRUNCATE_CHARS)}
---

Identify the top 3 most likely MUNDANE explanations. Common candidates: lens flare or camera artifact; consumer drone (DJI / quadcopter); military drone (MQ-9, RQ-170); Starlink satellite train; rocket / debris reflecting sunlight; high-altitude balloon (weather, surveillance, or hobby); ball lightning; misidentified astronomical object (Venus, Sirius, Jupiter, ISS); mirage / temperature inversion; bird, bat, or insect at close range; flare or pyrotechnic; aircraft landing lights at unusual angle; Chinese / Russian surveillance balloon; human hoax or fabricated photo; radar return artifact (chaff, ground clutter, weather); witness misinterpretation. Invent a better explanation if the doc warrants.

Pick a number for bust_score (0-100) and defend it in 2-4 sentences citing specific features of the report.

Separately assess concealment. Score cover_up_score (0-100, INDEPENDENT of bust_score) and list 0-6 concrete cover_up_indicators (each a short specific phrase, e.g. "page 12 references a classified Annex C", "~70% of pages contain sentence-level black-bar redaction", "witness names withheld in section 4", "public statement contradicts internal cable"). Write cover_up_reasoning in 1-3 sentences. If no concealment is evident, return cover_up_score=0 and cover_up_indicators=[]. Do NOT inflate cover-up just because a document is heavily formatted or marked SECRET — that is routine. Inflate only when specific evidence of suppression is present.`;
}

const METADATA_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, nullable: true },
    agency: { type: SchemaType.STRING, nullable: true },
    incident_date: { type: SchemaType.STRING, nullable: true, description: "ISO 8601 YYYY-MM-DD if a single point date" },
    incident_date_min: { type: SchemaType.STRING, nullable: true },
    incident_date_max: { type: SchemaType.STRING, nullable: true },
    incident_location: { type: SchemaType.STRING, nullable: true },
    document_type: { type: SchemaType.STRING, nullable: true },
    summary: { type: SchemaType.STRING, nullable: true },
    key_claims: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    sensor_modalities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    witnesses: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    reported_object_description: { type: SchemaType.STRING, nullable: true },
    reported_behavior: { type: SchemaType.STRING, nullable: true },
    official_resolution: { type: SchemaType.STRING, nullable: true },
    tags: {
      type: SchemaType.OBJECT,
      properties: {
        object:   { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        behavior: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        shape:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        color:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        theme:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: ["object","behavior","shape","color","theme"],
    },
  },
  required: ["title","agency","incident_date","incident_location","document_type","summary","key_claims","sensor_modalities","witnesses","reported_object_description","reported_behavior","official_resolution","tags"],
};

const BUST_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    bust_score: { type: SchemaType.INTEGER, nullable: true },
    bust_explanations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { rank: { type: SchemaType.INTEGER }, explanation: { type: SchemaType.STRING } },
        required: ["rank", "explanation"],
      },
    },
    reasoning: { type: SchemaType.STRING },
    cover_up_score: { type: SchemaType.INTEGER, nullable: true },
    cover_up_reasoning: { type: SchemaType.STRING },
    cover_up_indicators: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["bust_score", "bust_explanations", "reasoning", "cover_up_score", "cover_up_reasoning", "cover_up_indicators"],
};

interface MetadataResult {
  title: string | null; agency: string | null;
  incident_date: string | null; incident_date_min: string | null; incident_date_max: string | null;
  incident_location: string | null; document_type: string | null; summary: string | null;
  key_claims: string[]; sensor_modalities: string[]; witnesses: string[];
  reported_object_description: string | null; reported_behavior: string | null;
  official_resolution: string | null;
  tags: { object: string[]; behavior: string[]; shape: string[]; color: string[]; theme: string[] };
}

const EMPTY_TAGS: MetadataResult["tags"] = { object: [], behavior: [], shape: [], color: [], theme: [] };

interface BustResult {
  bust_score: number | null;
  bust_explanations: Array<{ rank: number; explanation: string }>;
  reasoning: string;
  cover_up_score: number | null;
  cover_up_reasoning: string;
  cover_up_indicators: string[];
}

const TRANSLATION_SYSTEM = `You translate UAP/UFO report fields from English to Simplified Chinese (zh-CN). Match the register: government cable English → formal 公文体. Preserve technical and military terms untranslated when no clean Chinese equivalent exists (FLIR, NORTHCOM, INDOPACOM, SWIR, FMV, MQ-9). Render agency names in conventional Chinese (FBI → 联邦调查局, NASA → 美国国家航空航天局, Department of State → 美国国务院, Department of War → 美国战争部). Translate place names using standard Chinese exonyms (Roswell → 罗斯威尔, Aguadilla → 阿瓜迪利亚). Keep array lengths identical to the input. If an input string is null or empty, return an empty string for that field/element.`;

interface TranslationInput {
  title: string | null;
  summary: string | null;
  incident_location: string | null;
  reported_object_description: string | null;
  reported_behavior: string | null;
  official_resolution: string | null;
  bust_reasoning: string | null;
  cover_up_reasoning: string | null;
  key_claims: string[];
  bust_explanations: string[];
  cover_up_indicators: string[];
}

interface TranslationResult {
  title_zh: string;
  summary_zh: string;
  incident_location_zh: string;
  reported_object_description_zh: string;
  reported_behavior_zh: string;
  official_resolution_zh: string;
  bust_reasoning_zh: string;
  cover_up_reasoning_zh: string;
  key_claims_zh: string[];
  bust_explanations_zh: string[];
  cover_up_indicators_zh: string[];
}

function buildTranslationPrompt(t: TranslationInput): string {
  return `Translate the following structured fields to Simplified Chinese. Return ONLY a JSON object with the matching _zh keys.

INPUT (JSON):
${JSON.stringify(t, null, 2)}`;
}

const TRANSLATION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title_zh:                          { type: SchemaType.STRING },
    summary_zh:                        { type: SchemaType.STRING },
    incident_location_zh:              { type: SchemaType.STRING },
    reported_object_description_zh:    { type: SchemaType.STRING },
    reported_behavior_zh:              { type: SchemaType.STRING },
    official_resolution_zh:            { type: SchemaType.STRING },
    bust_reasoning_zh:                 { type: SchemaType.STRING },
    cover_up_reasoning_zh:             { type: SchemaType.STRING },
    key_claims_zh:         { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    bust_explanations_zh:  { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    cover_up_indicators_zh:{ type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: [
    "title_zh","summary_zh","incident_location_zh",
    "reported_object_description_zh","reported_behavior_zh","official_resolution_zh",
    "bust_reasoning_zh","cover_up_reasoning_zh",
    "key_claims_zh","bust_explanations_zh","cover_up_indicators_zh",
  ],
};

let gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (gemini) return gemini;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set in environment (.env)");
  gemini = new GoogleGenerativeAI(key);
  return gemini;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini<T>(args: {
  modelName: string; systemInstruction: string; prompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}): Promise<T> {
  const model = getGemini().getGenerativeModel({
    model: args.modelName,
    systemInstruction: args.systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: args.schema as any,
      temperature: 0.2,
    },
  });
  const r = await model.generateContent(args.prompt);
  return JSON.parse(r.response.text()) as T;
}

function mergeWithCsv(meta: MetadataResult, csv: CsvRow | null): MetadataResult {
  if (!csv) return meta;
  return {
    ...meta,
    title: meta.title || csv.title || null,
    agency: meta.agency || csv.agency || null,
    incident_date: meta.incident_date || (csv.incidentDate && csv.incidentDate !== "N/A" ? normalizeDate(csv.incidentDate) : null),
    incident_location: meta.incident_location || (csv.incidentLocation && csv.incidentLocation !== "N/A" ? csv.incidentLocation : null),
  };
}

function normalizeDate(s: string): string | null {
  s = s.trim();
  if (!s || s === "N/A") return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy = yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return s;
}

function writeEvent(args: {
  folder: string; csvRow: CsvRow | null; frontmatter: Record<string, unknown>;
  meta: MetadataResult; bust: BustResult | null; translation: TranslationResult | null;
  fullText: string; pageCount: number; truncated: boolean; metadataHash: string; flags: Flags;
}): void {
  if (args.flags.dryRun) {
    console.log(`[dry-run] would write ${args.folder}: bust=${args.bust?.bust_score ?? "n/a"} coverup=${args.bust?.cover_up_score ?? "n/a"} tags=${[
      ...(args.meta.tags?.object ?? []),
      ...(args.meta.tags?.behavior ?? []),
    ].slice(0, 4).join(",")}`);
    return;
  }
  const db = getDb();
  const now = new Date().toISOString();
  const fm = args.frontmatter;
  const csv = args.csvRow;
  const m = args.meta;
  const t = args.translation;
  const parsedLocations = parseLocations(m.incident_location);
  const firstTerrestrial = parsedLocations.find((l) => l.kind === "terrestrial" && l.geo) ?? null;
  const geo = firstTerrestrial?.geo ?? null;

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM events WHERE folder_name = ?`).run(args.folder);
    const info = db.prepare(`INSERT INTO events (
      folder_name, dataset_row,
      source_title, source_url, thumbnail_url, pdf_local_path, release_date, description_blurb,
      title, agency,
      incident_date, incident_date_min, incident_date_max,
      incident_location, document_type, summary,
      reported_object_description, reported_behavior, official_resolution,
      bust_score, bust_reasoning,
      cover_up_score, cover_up_reasoning,
      latitude, longitude, geocode_source,
      full_text, page_count, was_truncated,
      llm_model_metadata, llm_model_bust,
      ingested_at, metadata_hash,
      title_zh, summary_zh, incident_location_zh,
      reported_object_description_zh, reported_behavior_zh, official_resolution_zh,
      bust_reasoning_zh, cover_up_reasoning_zh
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      args.folder, (fm.dataset_row as number) ?? null,
      (fm.source_title as string) ?? csv?.title ?? null,
      (fm.source_url as string) ?? csv?.pdfLink ?? null,
      csv?.modalImage || null, null,
      csv?.releaseDate ? normalizeDate(csv.releaseDate) : null,
      csv?.descriptionBlurb || null,
      m.title, m.agency,
      m.incident_date, m.incident_date_min, m.incident_date_max,
      m.incident_location, m.document_type, m.summary,
      m.reported_object_description, m.reported_behavior, m.official_resolution,
      args.bust?.bust_score ?? null, args.bust?.reasoning ?? null,
      args.bust?.cover_up_score ?? null, args.bust?.cover_up_reasoning ?? null,
      geo?.lat ?? null, geo?.lng ?? null, geo?.source ?? null,
      args.flags.skipText ? null : args.fullText,
      args.pageCount, args.truncated ? 1 : 0,
      METADATA_MODEL, args.bust ? BUST_MODEL : null,
      now, args.metadataHash,
      t?.title_zh || null, t?.summary_zh || null, t?.incident_location_zh || null,
      t?.reported_object_description_zh || null, t?.reported_behavior_zh || null, t?.official_resolution_zh || null,
      t?.bust_reasoning_zh || null, t?.cover_up_reasoning_zh || null
    );
    const eventId = info.lastInsertRowid as number;
    const insClaim = db.prepare(`INSERT INTO event_claims (event_id, position, claim, claim_zh) VALUES (?,?,?,?)`);
    m.key_claims.forEach((c, i) => insClaim.run(eventId, i, c, t?.key_claims_zh?.[i] || null));
    const insSensor = db.prepare(`INSERT OR IGNORE INTO event_sensors (event_id, modality) VALUES (?,?)`);
    m.sensor_modalities.forEach((s) => insSensor.run(eventId, s));
    const insW = db.prepare(`INSERT INTO event_witnesses (event_id, descriptor) VALUES (?,?)`);
    m.witnesses.forEach((w) => insW.run(eventId, w));
    const insBE = db.prepare(`INSERT INTO event_bust_explanations (event_id, rank, explanation, explanation_zh) VALUES (?,?,?,?)`);
    (args.bust?.bust_explanations ?? []).forEach((e, i) =>
      insBE.run(eventId, e.rank, e.explanation, t?.bust_explanations_zh?.[i] || null)
    );
    const insCu = db.prepare(`INSERT INTO event_cover_up_indicators (event_id, rank, indicator, indicator_zh) VALUES (?,?,?,?)`);
    (args.bust?.cover_up_indicators ?? []).forEach((ind, i) =>
      insCu.run(eventId, i, ind, t?.cover_up_indicators_zh?.[i] || null)
    );
    const insTag = db.prepare(`INSERT INTO event_tags (event_id, category, tag) VALUES (?,?,?)`);
    const tags = m.tags ?? EMPTY_TAGS;
    for (const cat of ["object","behavior","shape","color","theme"] as const) {
      const seen = new Set<string>();
      for (const raw of tags[cat] ?? []) {
        const norm = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        insTag.run(eventId, cat, norm);
      }
    }
    const insLoc = db.prepare(
      `INSERT INTO event_locations (event_id, position, location_text, latitude, longitude, geocode_source, kind)
       VALUES (?,?,?,?,?,?,?)`
    );
    parsedLocations.forEach((l, i) =>
      insLoc.run(eventId, i, l.text, l.geo?.lat ?? null, l.geo?.lng ?? null, l.geo?.source ?? null, l.kind)
    );
    refreshFtsClaims(db, eventId);
  });
  tx();
}

function existingHash(folder: string): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT metadata_hash FROM events WHERE folder_name = ?`).get(folder) as { metadata_hash: string } | undefined;
  return row?.metadata_hash ?? null;
}

function refreshLocationsOnly(folder: string, fallbackLocation: string | null): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, incident_location FROM events WHERE folder_name = ?`)
    .get(folder) as { id: number; incident_location: string | null } | undefined;
  if (!row) return false;
  const text = row.incident_location ?? fallbackLocation;
  const parsed = parseLocations(text);
  const first = parsed.find((l) => l.kind === "terrestrial" && l.geo) ?? null;
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM event_locations WHERE event_id = ?`).run(row.id);
    const ins = db.prepare(
      `INSERT INTO event_locations (event_id, position, location_text, latitude, longitude, geocode_source, kind)
       VALUES (?,?,?,?,?,?,?)`
    );
    parsed.forEach((l, i) =>
      ins.run(row.id, i, l.text, l.geo?.lat ?? null, l.geo?.lng ?? null, l.geo?.source ?? null, l.kind)
    );
    db.prepare(
      `UPDATE events SET latitude = ?, longitude = ?, geocode_source = ? WHERE id = ?`
    ).run(first?.geo?.lat ?? null, first?.geo?.lng ?? null, first?.geo?.source ?? null, row.id);
  });
  tx();
  return true;
}

function logError(folder: string, stage: string, err: unknown): void {
  const line = JSON.stringify({ folder, stage, error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() });
  fs.appendFileSync(ERRORS_PATH, line + "\n");
}

interface CalibrationRow {
  folder: string; agency: string | null; date: string | null; loc: string | null;
  bust: number | null; top1: string | null; reasoning: string | null;
}

function printCalibration(rows: CalibrationRow[]): void {
  console.log("\n────────── CALIBRATION SUMMARY ──────────");
  for (const r of rows) {
    console.log(`\n[${r.folder}]`);
    console.log(`  agency:    ${r.agency ?? "?"}`);
    console.log(`  date:      ${r.date ?? "?"}`);
    console.log(`  location:  ${r.loc ?? "?"}`);
    console.log(`  bust:      ${r.bust ?? "n/a"} / 100`);
    console.log(`  top guess: ${r.top1 ?? "n/a"}`);
    if (r.reasoning) console.log(`  reasoning: ${r.reasoning}`);
  }
  console.log("\n──────────────────────────────────────────\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log("flags:", flags);
  if (!fs.existsSync(CONVERTED_DIR)) throw new Error(`UFO-USA converted dir not found at ${CONVERTED_DIR}. Set UFO_USA_PATH in .env`);

  const csvMap = loadCsv();
  console.log(`[csv] loaded ${csvMap.size} ground-truth rows`);

  const folders = listFolders(flags.only);
  const targets = flags.limit ? folders.slice(0, flags.limit) : folders;
  console.log(`[walk] ${targets.length} folder(s) to process${flags.only ? ` (filtered by --only)` : ""}`);

  const calibration: CalibrationRow[] = [];
  const bar = new cliProgress.SingleBar(
    { format: "  [{bar}] {percentage}% | {value}/{total} | {folder}" },
    cliProgress.Presets.shades_classic
  );
  bar.start(targets.length, 0, { folder: "" });

  let processed = 0, skipped = 0, failed = 0;
  for (const folder of targets) {
    bar.update(processed + skipped + failed, { folder });
    let content: FolderContent;
    try { content = readFolder(folder); } catch (err) { logError(folder, "read", err); failed++; continue; }

    const hash = crypto.createHash("sha256").update(content.fullText).digest("hex");
    if (!flags.force && existingHash(folder) === hash) { skipped++; continue; }

    const fmTitle = (content.frontmatter.source_title as string) || folder;
    const csvKey = normalizeTitle(fmTitle);
    let csvRow = csvMap.get(csvKey) ?? null;
    if (!csvRow) for (const [k, v] of csvMap) if (k.includes(csvKey) || csvKey.includes(k)) { csvRow = v; break; }

    if (flags.noLlm) {
      if (refreshLocationsOnly(folder, csvRow?.incidentLocation ?? null)) {
        processed++;
        continue;
      }
    }

    let meta: MetadataResult = {
      title: csvRow?.title ?? null,
      agency: csvRow?.agency ?? null,
      incident_date: csvRow ? normalizeDate(csvRow.incidentDate) : null,
      incident_date_min: null, incident_date_max: null,
      incident_location: csvRow?.incidentLocation && csvRow.incidentLocation !== "N/A" ? csvRow.incidentLocation : null,
      document_type: null, summary: csvRow?.descriptionBlurb || null,
      key_claims: [], sensor_modalities: [], witnesses: [],
      reported_object_description: null, reported_behavior: null, official_resolution: null,
      tags: { ...EMPTY_TAGS, object: [], behavior: [], shape: [], color: [], theme: [] },
    };

    if (!flags.noLlm) {
      try {
        const out = await callGemini<MetadataResult>({
          modelName: METADATA_MODEL, systemInstruction: METADATA_SYSTEM,
          prompt: buildMetadataPrompt({ folder, csvRow, fullText: content.fullText }),
          schema: METADATA_SCHEMA,
        });
        meta = mergeWithCsv(out, csvRow);
        await sleep(SLEEP_MS);
      } catch (err) { logError(folder, "metadata", err); }
    }

    let bust: BustResult | null = null;
    if (!flags.noLlm && !flags.noBust && meta.document_type !== "photo_metadata") {
      try {
        bust = await callGemini<BustResult>({
          modelName: BUST_MODEL, systemInstruction: BUST_SYSTEM,
          prompt: buildBustPrompt({ folder, meta, fullText: content.fullText }),
          schema: BUST_SCHEMA,
        });
        await sleep(SLEEP_MS);
      } catch (err) { logError(folder, "bust", err); }
    }

    let translation: TranslationResult | null = null;
    if (!flags.noLlm && !flags.noTranslate) {
      try {
        translation = await callGemini<TranslationResult>({
          modelName: TRANSLATION_MODEL, systemInstruction: TRANSLATION_SYSTEM,
          prompt: buildTranslationPrompt({
            title: meta.title,
            summary: meta.summary,
            incident_location: meta.incident_location,
            reported_object_description: meta.reported_object_description,
            reported_behavior: meta.reported_behavior,
            official_resolution: meta.official_resolution,
            bust_reasoning: bust?.reasoning ?? null,
            cover_up_reasoning: bust?.cover_up_reasoning ?? null,
            key_claims: meta.key_claims,
            bust_explanations: (bust?.bust_explanations ?? []).map((e) => e.explanation),
            cover_up_indicators: bust?.cover_up_indicators ?? [],
          }),
          schema: TRANSLATION_SCHEMA,
        });
        await sleep(SLEEP_MS);
      } catch (err) { logError(folder, "translate", err); }
    }

    try {
      writeEvent({
        folder, csvRow, frontmatter: content.frontmatter, meta, bust, translation,
        fullText: content.fullText, pageCount: content.pages,
        truncated: content.truncated, metadataHash: hash, flags,
      });
      processed++;
      if (flags.only) {
        calibration.push({
          folder, agency: meta.agency,
          date: meta.incident_date || meta.incident_date_min,
          loc: meta.incident_location,
          bust: bust?.bust_score ?? null,
          top1: bust?.bust_explanations?.[0]?.explanation ?? null,
          reasoning: bust?.reasoning ?? null,
        });
      }
    } catch (err) { logError(folder, "write", err); failed++; }
  }

  bar.update(targets.length, { folder: "done" });
  bar.stop();
  console.log(`[done] processed=${processed} skipped=${skipped} failed=${failed}`);
  if (calibration.length > 0) printCalibration(calibration);
  closeDb();
}

main().catch((err) => { console.error("[fatal]", err); closeDb(); process.exit(1); });
