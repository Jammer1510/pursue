"use client";

import { useState } from "react";
import type { EventSummary } from "@/lib/types";
import { formatDate, bustClasses } from "@/lib/format";
import { useLocale } from "./locale-provider";
import { pickField, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface OffMapDrawerProps {
  offEarth: EventSummary[];
  unknown: EventSummary[];
  onSelect: (id: number) => void;
}

export function OffMapDrawer({ offEarth, unknown, onSelect }: OffMapDrawerProps) {
  const [open, setOpen] = useState(false);
  const { locale } = useLocale();
  const total = offEarth.length + unknown.length;
  if (total === 0) return null;

  return (
    <div className="absolute left-4 top-4 z-[400] max-h-[calc(100vh-7rem)] overflow-hidden rounded border border-zinc-700 bg-zinc-900/95 font-mono text-xs text-zinc-300 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-800"
        aria-expanded={open}
      >
        <span className="uppercase tracking-widest text-zinc-400">
          {t("drawer.offMap", locale)} <span className="ml-1 text-zinc-200">({total})</span>
        </span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto border-t border-zinc-800 px-2 py-2">
          {offEarth.length > 0 && (
            <Section
              label={`${t("drawer.offEarth", locale)} (${offEarth.length})`}
              events={offEarth}
              onSelect={onSelect}
            />
          )}
          {unknown.length > 0 && (
            <Section
              label={`${t("drawer.noPrecise", locale)} (${unknown.length})`}
              events={unknown}
              onSelect={onSelect}
              className={offEarth.length > 0 ? "mt-3" : ""}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  events,
  onSelect,
  className,
}: {
  label: string;
  events: EventSummary[];
  onSelect: (id: number) => void;
  className?: string;
}) {
  const { locale } = useLocale();
  return (
    <section className={className}>
      <h4 className="px-2 pb-1 text-[10px] uppercase tracking-widest text-zinc-500">{label}</h4>
      <ul className="space-y-0.5">
        {events.map((e) => {
          const c = bustClasses(e.bust_score, locale);
          const title = pickField(e, "title", locale) || e.folder_name;
          const loc = pickField(e, "incident_location", locale);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-zinc-800"
              >
                <div className="truncate text-zinc-200">{title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>{formatDate(e)}</span>
                  {loc && <span>· {loc}</span>}
                  <span className={cn("ml-auto", c.text)}>{c.label}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
