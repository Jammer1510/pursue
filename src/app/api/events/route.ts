import { NextResponse } from "next/server";
import { searchEvents } from "@/lib/queries";
import type { EventFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: EventFilters = {};

  const agencies = searchParams.get("agencies");
  if (agencies) filters.agencies = agencies.split(",").filter(Boolean);

  const documentTypes = searchParams.get("documentTypes");
  if (documentTypes) filters.documentTypes = documentTypes.split(",").filter(Boolean);

  const yearMin = searchParams.get("yearMin");
  if (yearMin) filters.yearMin = parseInt(yearMin, 10);

  const yearMax = searchParams.get("yearMax");
  if (yearMax) filters.yearMax = parseInt(yearMax, 10);

  const bustMin = searchParams.get("bustMin");
  if (bustMin) filters.bustMin = parseInt(bustMin, 10);

  const bustMax = searchParams.get("bustMax");
  if (bustMax) filters.bustMax = parseInt(bustMax, 10);

  const search = searchParams.get("search");
  if (search) filters.search = search;

  const events = searchEvents(filters);
  return NextResponse.json({ events });
}
