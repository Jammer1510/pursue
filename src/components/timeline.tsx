"use client";

import { useMemo, useState } from "react";
import type { EventSummary } from "@/lib/types";
import { eventYear } from "@/lib/format";
import { EventCard } from "./event-card";
import { EventDetailPanel } from "./event-detail-panel";

export function Timeline({ events }: { events: EventSummary[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const e of events) {
      const y = eventYear(e);
      const key = y == null ? "Undated" : String(y);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === "Undated") return 1;
      if (b === "Undated") return -1;
      return parseInt(a) - parseInt(b);
    });
    return sortedKeys.map((k) => ({ year: k, items: map.get(k)! }));
  }, [events]);

  return (
    <>
      <div className="space-y-8 px-4 py-6">
        {grouped.map(({ year, items }) => (
          <section key={year} className="flex gap-4">
            <div className="sticky left-0 top-20 flex h-full w-20 shrink-0 flex-col items-end pt-1">
              <span className="font-mono text-2xl font-bold text-zinc-500">{year}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">
                {items.length} doc{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
              {items.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => setSelectedId(e.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <EventDetailPanel selectedId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
