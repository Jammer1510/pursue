"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { EventSummary, EventLocation } from "@/lib/types";
import { EventDetailInline } from "./event-detail-inline";
import { OffMapDrawer } from "./off-map-drawer";
import { formatDate, bustClasses } from "@/lib/format";
import { useLocale } from "./locale-provider";

function pinColor(score: number | null): string {
  if (score == null) return "#52525b";
  if (score >= 70) return "#a1a1aa";
  if (score >= 30) return "#fbbf24";
  return "#34d399";
}

export function MapView({ events, locations }: { events: EventSummary[]; locations: EventLocation[] }) {
  const { locale } = useLocale();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const handleCollapseChange = () => {
    requestAnimationFrame(() => {
      mapRef.current?.invalidateSize();
    });
    setTimeout(() => mapRef.current?.invalidateSize(), 220);
  };

  useEffect(() => {
    const onResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const { pins, offEarth, unknown } = useMemo(() => {
    const placed = new Set<number>();
    const offEarthIds = new Set<number>();
    const raw: Array<{ loc: EventLocation; event: EventSummary }> = [];

    for (const loc of locations) {
      const event = eventById.get(loc.event_id);
      if (!event) continue;
      if (loc.kind === "terrestrial" && loc.latitude != null && loc.longitude != null) {
        raw.push({ loc, event });
        placed.add(event.id);
      } else if (loc.kind === "off-earth") {
        offEarthIds.add(event.id);
      }
    }

    const groups = new Map<string, Array<{ loc: EventLocation; event: EventSummary }>>();
    for (const item of raw) {
      const key = `${item.loc.latitude},${item.loc.longitude}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    const pinsLocal: Array<{ loc: EventLocation; event: EventSummary; lat: number; lng: number }> = [];
    for (const bucket of groups.values()) {
      if (bucket.length === 1) {
        const it = bucket[0];
        pinsLocal.push({ ...it, lat: it.loc.latitude!, lng: it.loc.longitude! });
        continue;
      }
      const baseLat = bucket[0].loc.latitude!;
      const baseLng = bucket[0].loc.longitude!;
      const radius = 0.35 + 0.04 * bucket.length;
      const lngScale = Math.max(0.25, Math.cos((baseLat * Math.PI) / 180));
      bucket.forEach((it, i) => {
        const theta = (2 * Math.PI * i) / bucket.length;
        pinsLocal.push({
          ...it,
          lat: baseLat + radius * Math.sin(theta),
          lng: baseLng + (radius * Math.cos(theta)) / lngScale,
        });
      });
    }

    const offEarthList = events.filter((e) => offEarthIds.has(e.id) && !placed.has(e.id));
    const placedOrOffEarth = new Set<number>([...placed, ...offEarthList.map((e) => e.id)]);
    const unknownList = events.filter((e) => !placedOrOffEarth.has(e.id));

    return { pins: pinsLocal, offEarth: offEarthList, unknown: unknownList };
  }, [events, locations, eventById]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <div className="relative flex-1">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: "100%", width: "100%", background: "#0a0a0a" }}
          worldCopyJump
          ref={(instance) => { mapRef.current = instance; }}
        >
          <TileLayer
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {pins.map(({ loc, event, lat, lng }) => {
            const fillColor = pinColor(event.bust_score);
            const c = bustClasses(event.bust_score, locale);
            return (
              <CircleMarker
                key={loc.id}
                center={[lat, lng]}
                radius={7}
                pathOptions={{ color: fillColor, fillColor, fillOpacity: 0.7, weight: 1 }}
                eventHandlers={{ click: () => setSelectedId(event.id) }}
              >
                <Tooltip>
                  <div className="font-mono text-xs">
                    <div>{event.title || event.folder_name}</div>
                    <div className="text-zinc-500">
                      {formatDate(event)} · {loc.location_text}
                    </div>
                    <div className={c.text}>{c.label}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <OffMapDrawer offEarth={offEarth} unknown={unknown} onSelect={setSelectedId} />
      </div>
      <EventDetailInline
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onCollapseChange={handleCollapseChange}
      />
    </div>
  );
}
