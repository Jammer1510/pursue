"use client";

import type { EventSummary } from "@/lib/types";
import { formatDate, agencyAccent } from "@/lib/format";
import { BustPill } from "./bust-pill";
import { AgencyBadge } from "./agency-badge";
import { useLocale } from "./locale-provider";
import { pickField } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function EventCard({
  event,
  onClick,
  fullWidth = false,
}: {
  event: EventSummary;
  onClick: () => void;
  fullWidth?: boolean;
}) {
  const { locale } = useLocale();
  const title = pickField(event, "title", locale) || event.folder_name;
  const incidentLocation = pickField(event, "incident_location", locale);
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-2 rounded-md border border-zinc-800 border-l-4 bg-zinc-950 p-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900",
        fullWidth ? "w-full" : "w-72 shrink-0",
        agencyAccent(event.agency)
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-mono text-xs text-zinc-500">{formatDate(event)}</span>
        <BustPill score={event.bust_score} />
      </div>
      <h3 className="line-clamp-3 font-mono text-sm leading-snug text-zinc-100">{title}</h3>
      <div className="flex w-full items-center justify-between gap-2 pt-1">
        <AgencyBadge agency={event.agency} />
        <span className="truncate text-xs text-zinc-500">{incidentLocation ?? "—"}</span>
      </div>
    </button>
  );
}
