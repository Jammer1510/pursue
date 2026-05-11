"use client";

import dynamic from "next/dynamic";
import type { EventSummary, EventLocation } from "@/lib/types";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center font-mono text-xs text-zinc-500">
      loading map…
    </div>
  ),
});

export function MapClient({ events, locations }: { events: EventSummary[]; locations: EventLocation[] }) {
  return <MapView events={events} locations={locations} />;
}
