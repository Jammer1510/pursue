"use client";

import { useEffect, useState } from "react";
import type { EventRecord } from "@/lib/types";
import { EventDetailBody } from "./event-detail-body";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "map.panel.collapsed";

export function EventDetailInline({
  selectedId,
  onClose,
  onCollapseChange,
}: {
  selectedId: number | null;
  onClose: () => void;
  onCollapseChange?: (collapsed: boolean) => void;
}) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    onCollapseChange?.(collapsed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed, onCollapseChange]);

  useEffect(() => {
    if (selectedId == null) { setEvent(null); return; }
    setLoading(true);
    fetch(`/api/events/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setEvent(d.event))
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-200 transition-[width] duration-200 ease-out",
        collapsed ? "w-10" : "w-[40rem] max-w-[55vw]"
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expand detail panel" : "Collapse detail panel"}
        className="absolute -left-3 top-3 z-[450] flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-400 shadow hover:border-zinc-500 hover:text-zinc-200"
      >
        {collapsed ? "‹" : "›"}
      </button>

      {collapsed ? (
        <div className="flex h-full items-center justify-center">
          <span className="rotate-180 font-mono text-[10px] uppercase tracking-widest text-zinc-600 [writing-mode:vertical-rl]">
            Event detail
          </span>
        </div>
      ) : selectedId == null ? (
        <div className="flex h-full items-center justify-center px-6 text-center font-mono text-xs leading-relaxed text-zinc-500">
          Click a pin to view details. Click another pin anytime — no need to close.
        </div>
      ) : loading || !event ? (
        <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-500">
          {loading ? "loading…" : "no selection"}
        </div>
      ) : (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-end border-b border-zinc-800 px-2 py-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
              aria-label="Close"
            >
              Clear ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EventDetailBody event={event} />
          </div>
        </div>
      )}
    </aside>
  );
}
