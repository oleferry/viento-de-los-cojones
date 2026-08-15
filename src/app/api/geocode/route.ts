import { NextResponse } from "next/server";
import { geocode } from "@/lib/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("q")?.trim();
  if (!text || text.length < 3) return NextResponse.json({ results: [] });
  try {
    const results = await geocode(text);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
