"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { EventRecord } from "@/lib/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BustPill } from "./bust-pill";
import { CoverUpPill } from "./cover-up-pill";
import { AgencyBadge } from "./agency-badge";
import { formatDate, bustClasses } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pickField, pickArray, t } from "@/lib/i18n";
import { useLocale } from "./locale-provider";

export function EventDetailBody({ event }: { event: EventRecord }) {
  const [showText, setShowText] = useState(false);
  const { locale } = useLocale();
  const c = bustClasses(event.bust_score);
  const title = pickField(event, "title", locale) || event.folder_name;
  const incidentLocation = pickField(event, "incident_location", locale);
  const summary = pickField(event, "summary", locale);
  const reportedObject = pickField(event, "reported_object_description", locale);
  const reportedBehavior = pickField(event, "reported_behavior", locale);
  const officialResolution = pickField(event, "official_resolution", locale);
  const bustReasoning = pickField(event, "bust_reasoning", locale);
  const coverUpReasoning = pickField(event, "cover_up_reasoning", locale);
  const claims = pickArray(event, "claims", locale);
  const bustExplanations = pickArray(event, "bust_explanations", locale);
  const coverUpIndicators = pickArray(event, "cover_up_indicators", locale);

  return (
    <>
      <header className="space-y-2 border-b border-zinc-800 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <AgencyBadge agency={event.agency} />
          <span className="font-mono text-xs text-zinc-500">{formatDate(event)}</span>
          {incidentLocation && (
            <span className="font-mono text-xs text-zinc-500">· {incidentLocation}</span>
          )}
        </div>
        <h2 className="font-mono text-base leading-snug text-zinc-100">{title}</h2>
      </header>

      <div className="space-y-6 px-4 py-5">
        <section className={cn("rounded-md border p-3", c.border, c.bg)}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.bust", locale)}</h4>
            <BustPill score={event.bust_score} />
          </div>
          {bustExplanations.length > 0 && (
            <ol className="ml-4 list-decimal space-y-1 text-sm text-zinc-200">
              {bustExplanations.map((e, i) => (
                <li key={i} className="leading-snug">{e}</li>
              ))}
            </ol>
          )}
          {bustReasoning && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{bustReasoning}</p>
          )}
        </section>

        {(event.cover_up_score != null || coverUpIndicators.length > 0) && (
          <section className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="font-mono text-xs uppercase tracking-widest text-rose-300/80">{t("detail.coverup", locale)}</h4>
              <CoverUpPill score={event.cover_up_score} />
            </div>
            {coverUpIndicators.length > 0 && (
              <ul className="ml-4 list-disc space-y-1 text-sm text-zinc-200">
                {coverUpIndicators.map((c, i) => (
                  <li key={i} className="leading-snug">{c}</li>
                ))}
              </ul>
            )}
            {coverUpReasoning && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{coverUpReasoning}</p>
            )}
          </section>
        )}

        {summary && (
          <section>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.summary", locale)}</h4>
            <p className="text-sm leading-relaxed text-zinc-200">{summary}</p>
          </section>
        )}

        <MetaRow label={t("detail.object", locale)} value={reportedObject} />
        <MetaRow label={t("detail.behavior", locale)} value={reportedBehavior} />
        <MetaRow label={t("detail.resolution", locale)} value={officialResolution} />
        <MetaRow label={t("detail.docType", locale)} value={event.document_type} />

        {claims.length > 0 && (
          <section>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.claims", locale)}</h4>
            <ul className="ml-4 list-disc space-y-1 text-sm text-zinc-200">
              {claims.map((cl, i) => (
                <li key={i} className="leading-snug">{cl}</li>
              ))}
            </ul>
          </section>
        )}

        {event.tags && event.tags.length > 0 && (
          <section>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.tags", locale)}</h4>
            <div className="flex flex-wrap gap-1">
              {event.tags.map((tag, i) => (
                <span
                  key={`${tag.category}:${tag.tag}:${i}`}
                  className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300"
                  title={tag.category}
                >
                  {tag.tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {event.sensors.length > 0 && (
          <section>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.sensors", locale)}</h4>
            <div className="flex flex-wrap gap-1">
              {event.sensors.map((s) => (
                <span key={s} className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-300">{s}</span>
              ))}
            </div>
          </section>
        )}

        {event.witnesses.length > 0 && (
          <section>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">{t("detail.witnesses", locale)}</h4>
            <div className="flex flex-wrap gap-1">
              {event.witnesses.map((w, i) => (
                <span key={i} className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-300">{w}</span>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500"
            >
              {t("detail.openPdf", locale)}
            </a>
          )}
          {event.thumbnail_url && (
            <a
              href={event.thumbnail_url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500"
            >
              {t("detail.thumbnail", locale)}
            </a>
          )}
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {event.page_count} pages{event.was_truncated ? " · truncated" : ""}
          </span>
        </section>

        {event.full_text && (
          <Collapsible open={showText} onOpenChange={setShowText}>
            <CollapsibleTrigger className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-zinc-400 hover:bg-zinc-800">
              {showText ? "▼" : "▶"} {t("detail.fullText", locale)}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 max-h-96 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/50 p-3 font-mono text-xs leading-relaxed text-zinc-300">
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{event.full_text}</ReactMarkdown>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <section>
      <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-zinc-400">{label}</h4>
      <p className="text-sm text-zinc-200">{value}</p>
    </section>
  );
}
