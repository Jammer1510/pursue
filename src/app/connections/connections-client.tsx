"use client";

import { useEffect, useMemo, useState } from "react";
import type { TagAggregate } from "@/lib/queries";
import type { EventSummary } from "@/lib/types";
import { formatDate, bustClasses } from "@/lib/format";
import { useLocale } from "@/components/locale-provider";
import { EventDetailPanel } from "@/components/event-detail-panel";
import { pickField, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SelectedTag {
  category: string;
  tag: string;
}

const CATEGORY_ORDER = ["theme", "object", "behavior", "shape", "color"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  theme: "Theme",
  object: "Object",
  behavior: "Behavior",
  shape: "Shape",
  color: "Color",
};

export function ConnectionsClient({ aggregates }: { aggregates: TagAggregate[] }) {
  const { locale } = useLocale();
  const [selected, setSelected] = useState<SelectedTag[]>([]);
  const [filter, setFilter] = useState("");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const g: Record<string, TagAggregate[]> = {};
    const q = filter.trim().toLowerCase();
    for (const a of aggregates) {
      if (q && !a.tag.includes(q)) continue;
      (g[a.category] ??= []).push(a);
    }
    return g;
  }, [aggregates, filter]);

  useEffect(() => {
    if (selected.length === 0) { setEvents([]); return; }
    setLoading(true);
    const params = new URLSearchParams();
    params.set("tags", selected.map((s) => `${s.category}:${s.tag}`).join(","));
    fetch(`/api/connections?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [selected]);

  const isSelected = (cat: string, tag: string) =>
    selected.some((s) => s.category === cat && s.tag === tag);

  const toggle = (cat: string, tag: string) => {
    setSelected((cur) =>
      isSelected(cat, tag)
        ? cur.filter((s) => !(s.category === cat && s.tag === tag))
        : [...cur, { category: cat, tag }]
    );
  };

  const yearSpan = useMemo(() => {
    if (events.length === 0) return null;
    const years = events
      .map((e) => {
        const d = e.incident_date || e.incident_date_min;
        return d ? parseInt(d.slice(0, 4), 10) : null;
      })
      .filter((y): y is number => Number.isFinite(y));
    if (years.length === 0) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min}` : `${min}–${max}`;
  }, [events]);

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[420px_1fr]">
      {/* LEFT: tag picker */}
      <aside className="flex h-full flex-col overflow-hidden border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h1 className="font-mono text-xs uppercase tracking-widest text-zinc-400">
            {t("conn.title", locale)}
          </h1>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            {t("conn.tagline", locale)}
          </p>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("conn.filter", locale)}
            className="mt-3 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {CATEGORY_ORDER.map((cat) => {
            const list = grouped[cat] ?? [];
            if (list.length === 0) return null;
            return (
              <section key={cat} className="mb-4">
                <h4 className="mb-1 px-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {CATEGORY_LABELS[cat]}
                </h4>
                <ul className="flex flex-wrap gap-1">
                  {list.map((a) => {
                    const sel = isSelected(a.category, a.tag);
                    return (
                      <li key={`${a.category}:${a.tag}`}>
                        <button
                          type="button"
                          onClick={() => toggle(a.category, a.tag)}
                          className={cn(
                            "rounded border px-2.5 py-1 font-mono text-[11px] transition-colors",
                            sel
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                          )}
                        >
                          {a.tag}{" "}
                          <span className={cn("text-[10px]", sel ? "text-emerald-400" : "text-zinc-500")}>
                            {a.count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {aggregates.length === 0 && (
            <div className="px-2 py-4 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
              No tags extracted yet. Re-ingest is still running — refresh once it finishes.
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT: results */}
      <main className="flex h-full flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {selected.length === 0 ? (
              <span className="font-mono text-xs text-zinc-500">{t("conn.noSelected", locale)}</span>
            ) : (
              selected.map((s) => (
                <button
                  key={`${s.category}:${s.tag}`}
                  type="button"
                  onClick={() => toggle(s.category, s.tag)}
                  className="rounded border border-emerald-500 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                  title="Remove"
                >
                  {s.category}:{s.tag} ✕
                </button>
              ))
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="ml-2 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
              >
                {t("conn.clearAll", locale)}
              </button>
            )}
          </div>
          <div className="font-mono text-[11px] text-zinc-500">
            {loading
              ? "loading…"
              : selected.length === 0
              ? ""
              : `${events.length} event${events.length === 1 ? "" : "s"}${yearSpan ? ` · ${yearSpan}` : ""}`}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {selected.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center font-mono text-xs leading-relaxed text-zinc-500">
              {t("conn.cta", locale)}
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-500">{t("panel.loading", locale)}</div>
          ) : events.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center font-mono text-xs text-zinc-500">
              {t("conn.empty", locale)}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {events.map((e) => {
                const c = bustClasses(e.bust_score, locale);
                const title = pickField(e, "title", locale) || e.folder_name;
                const loc = pickField(e, "incident_location", locale);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(e.id)}
                      className="block w-full px-4 py-3 text-left hover:bg-zinc-900/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="break-words font-mono text-sm text-zinc-100">
                            {title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-zinc-500">
                            <span className="shrink-0">{e.agency || "—"}</span>
                            <span className="shrink-0">·</span>
                            <span className="shrink-0">{formatDate(e)}</span>
                            {loc && (
                              <>
                                <span className="shrink-0">·</span>
                                <span className="break-words">{loc}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-widest", c.text)}>
                          {c.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <EventDetailPanel selectedId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </div>
  );
}
