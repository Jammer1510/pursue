export type Agency =
  | "FBI"
  | "Department of War"
  | "Department of State"
  | "NASA"
  | "NORTHCOM"
  | "CENTCOM"
  | "INDOPACOM"
  | "Other";

export type DocumentType =
  | "mission_report"
  | "witness_statement"
  | "FBI_case_file"
  | "NASA_transcript"
  | "diplomatic_cable"
  | "photo_metadata"
  | "other";

export type Resolution =
  | "resolved"
  | "unresolved"
  | "partially_explained"
  | "not_assessed";

export type SensorModality =
  | "visual"
  | "IR"
  | "FLIR"
  | "radar"
  | "SWIR"
  | "FMV"
  | "NVG"
  | "none";

export type LocationKind = "terrestrial" | "off-earth" | "unknown";

export interface EventLocation {
  id: number;
  event_id: number;
  position: number;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  geocode_source: string | null;
  kind: LocationKind;
}

export interface EventRecord {
  id: number;
  folder_name: string;
  dataset_row: number | null;

  source_title: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  pdf_local_path: string | null;
  release_date: string | null;
  description_blurb: string | null;

  title: string | null;
  agency: string | null;
  incident_date: string | null;
  incident_date_min: string | null;
  incident_date_max: string | null;
  incident_location: string | null;
  document_type: string | null;
  summary: string | null;
  reported_object_description: string | null;
  reported_behavior: string | null;
  official_resolution: string | null;

  bust_score: number | null;
  bust_reasoning: string | null;

  latitude: number | null;
  longitude: number | null;
  geocode_source: string | null;

  full_text: string | null;
  page_count: number | null;
  was_truncated: number;

  llm_model_metadata: string | null;
  llm_model_bust: string | null;
  ingested_at: string;
  metadata_hash: string;

  claims: string[];
  sensors: string[];
  witnesses: string[];
  bust_explanations: string[];
  locations: EventLocation[];

  cover_up_score: number | null;
  cover_up_reasoning: string | null;
  cover_up_indicators: string[];

  title_zh: string | null;
  summary_zh: string | null;
  reported_object_description_zh: string | null;
  reported_behavior_zh: string | null;
  official_resolution_zh: string | null;
  bust_reasoning_zh: string | null;
  cover_up_reasoning_zh: string | null;
  incident_location_zh: string | null;
  claims_zh: string[];
  bust_explanations_zh: string[];
  cover_up_indicators_zh: string[];

  tags: EventTag[];
}

export interface EventTag {
  category: string;
  tag: string;
}

export interface EventSummary {
  id: number;
  folder_name: string;
  title: string | null;
  agency: string | null;
  incident_date: string | null;
  incident_date_min: string | null;
  incident_date_max: string | null;
  incident_location: string | null;
  document_type: string | null;
  bust_score: number | null;
  cover_up_score: number | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  title_zh: string | null;
  incident_location_zh: string | null;
}

export interface EventFilters {
  agencies?: string[];
  documentTypes?: string[];
  yearMin?: number;
  yearMax?: number;
  bustMin?: number;
  bustMax?: number;
  search?: string;
}
