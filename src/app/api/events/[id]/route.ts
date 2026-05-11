import { NextResponse } from "next/server";
import { getEventById } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const event = getEventById(n);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
