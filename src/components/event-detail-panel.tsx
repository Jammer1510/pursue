"use client";

import { useEffect, useState } from "react";
import type { EventRecord } from "@/lib/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EventDetailBody } from "./event-detail-body";

export function EventDetailPanel({
  selectedId,
  onClose,
  side = "right",
}: {
  selectedId: number | null;
  onClose: () => void;
  side?: "right" | "bottom";
}) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedId == null) { setEvent(null); return; }
    setLoading(true);
    fetch(`/api/events/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setEvent(d.event))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const className =
    side === "bottom"
      ? "max-h-[70vh] overflow-y-auto rounded-t-lg border-t border-zinc-800 bg-zinc-950 text-zinc-200"
      : "w-full overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-200 sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-5xl";

  return (
    <Sheet open={selectedId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={side} className={className}>
        {loading || !event ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-500">
            {loading ? "loading…" : "no selection"}
          </div>
        ) : (
          <EventDetailBody event={event} />
        )}
      </SheetContent>
    </Sheet>
  );
}
