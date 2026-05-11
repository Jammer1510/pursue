import { NextResponse } from "next/server";
import { getEventsByTagIntersection } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tags");
  if (!raw) return NextResponse.json({ events: [] });
  const tags = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const idx = s.indexOf(":");
      if (idx <= 0) return null;
      return { category: s.slice(0, idx), tag: s.slice(idx + 1) };
    })
    .filter((t): t is { category: string; tag: string } => t !== null);
  const events = getEventsByTagIntersection(tags);
  return NextResponse.json({ events });
}
