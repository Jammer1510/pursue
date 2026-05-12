"use client";

import { useEffect, useState } from "react";
import type { EventRecord } from "@/lib/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EventDetailBody } from "./event-detail-body";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const isBottom = side === "bottom";
  const className =
    isBottom
      ? "z-[1200] max-h-[85vh] flex flex-col rounded-t-lg border-t border-zinc-800 bg-zinc-950 text-zinc-200 mt-[env(safe-area-inset-top)]"
      : "z-[1200] w-full overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-200 sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-5xl";

  return (
    <Sheet open={selectedId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={side} className={className} showCloseButton={!isBottom}>
        {isBottom && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Event Detail
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className={cn("flex-1 overflow-y-auto", !isBottom && "h-full")}>
          {loading || !event ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-500">
              {loading ? "loading…" : "no selection"}
            </div>
          ) : (
            <EventDetailBody event={event} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
