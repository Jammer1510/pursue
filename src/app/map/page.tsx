import { getAllEventSummaries, getAllEventLocations } from "@/lib/queries";
import { MapClient } from "./map-client";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const events = getAllEventSummaries();
  const locations = getAllEventLocations();
  return <MapClient events={events} locations={locations} />;
}
