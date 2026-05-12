import type { EventSummary, EventRecord } from "./types";
import { type Locale, t } from "./i18n";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDate(e: Pick<EventSummary | EventRecord, "incident_date" | "incident_date_min" | "incident_date_max">): string {
  if (e.incident_date) return formatIso(e.incident_date);
  if (e.incident_date_min || e.incident_date_max) {
    const a = e.incident_date_min ? formatIso(e.incident_date_min) : "?";
    const b = e.incident_date_max ? formatIso(e.incident_date_max) : "?";
    return `${a} – ${b}`;
  }
  return "Undated";
}

function formatIso(s: string): string {
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${MONTHS[+ymd[2]-1]} ${+ymd[3]}, ${ymd[1]}`;
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${MONTHS[+ym[2]-1]} ${ym[1]}`;
  const y = s.match(/^(\d{4})$/);
  if (y) return y[1];
  return s;
}

export function eventYear(e: Pick<EventSummary, "incident_date" | "incident_date_min">): number | null {
  const s = e.incident_date || e.incident_date_min;
  if (!s) return null;
  const m = s.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

export interface BustClasses {
  text: string;
  bg: string;
  border: string;
  label: string;
}

export function bustClasses(score: number | null, locale: Locale = "en"): BustClasses {
  if (score == null) return { text: "text-zinc-400", bg: "bg-zinc-800", border: "border-zinc-700", label: t("bust.unassessed", locale) };
  if (score >= 70) return { text: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-700", label: `${score} · ${t("bust.mundane", locale)}` };
  if (score >= 30) return { text: "text-amber-300", bg: "bg-amber-950/40", border: "border-amber-800", label: `${score} · ${t("bust.uncertain", locale)}` };
  return { text: "text-rose-300", bg: "bg-rose-950/40", border: "border-rose-700", label: `${score} · ${t("bust.weird", locale)}` };
}

export function coverUpClasses(score: number | null, locale: Locale = "en"): BustClasses {
  if (score == null) return { text: "text-zinc-500", bg: "bg-zinc-900", border: "border-zinc-800", label: "—" };
  if (score >= 80) return { text: "text-rose-200", bg: "bg-rose-950/50", border: "border-rose-600", label: `${score} · ${t("coverup.extreme", locale)}` };
  if (score >= 50) return { text: "text-rose-300", bg: "bg-rose-950/30", border: "border-rose-800", label: `${score} · ${t("coverup.heavy", locale)}` };
  if (score >= 20) return { text: "text-amber-300", bg: "bg-amber-950/30", border: "border-amber-900", label: `${score} · ${t("coverup.routine", locale)}` };
  return { text: "text-zinc-400", bg: "bg-zinc-900", border: "border-zinc-800", label: `${score} · ${t("coverup.none", locale)}` };
}

const AGENCY_ACCENTS: Record<string, string> = {
  "FBI": "border-l-yellow-600",
  "Department of War": "border-l-rose-700",
  "Department of State": "border-l-sky-700",
  "NASA": "border-l-blue-600",
  "NORTHCOM": "border-l-rose-700",
  "CENTCOM": "border-l-rose-700",
  "INDOPACOM": "border-l-rose-700",
};

export function agencyAccent(agency: string | null): string {
  if (!agency) return "border-l-zinc-700";
  return AGENCY_ACCENTS[agency] ?? "border-l-zinc-600";
}

export function shortAgency(agency: string | null): string {
  if (!agency) return "—";
  return agency
    .replace("Department of War", "DoW")
    .replace("Department of State", "State");
}
