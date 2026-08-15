import { NextResponse } from "next/server";
import { analyze } from "@/lib/analyze";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Igual que en /api/plan: rangos plausibles, fuera de ellos se ignora. */
const RIDER_BOUNDS: Record<string, [number, number]> = {
  powerW: [40, 600],
  massKg: [35, 200],
  cda: [0.1, 1.2],
  crr: [0.001, 0.03],
  drivetrain: [0.85, 1],
  rho: [0.6, 1.5],
  draftMultiplier: [0.3, 1],
  draftFraction: [0, 1],
};

function sanitizeRider(raw: unknown) {
  if (typeof raw !== "object" || !raw) return undefined;
  const out: Record<string, number> = {};
  for (const [key, [lo, hi]] of Object.entries(RIDER_BOUNDS)) {
    const v = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(v) && v >= lo && v <= hi) out[key] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const raw = body.coords;
  if (!Array.isArray(raw) || raw.length < 2) {
    return NextResponse.json(
      { error: "La ruta necesita al menos dos puntos" },
      { status: 400 }
    );
  }
  if (raw.length > 20000) {
    return NextResponse.json({ error: "La ruta tiene demasiados puntos" }, { status: 400 });
  }

  const coords: number[][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const ele = Number(p[2]);
    coords.push(Number.isFinite(ele) ? [lon, lat, ele] : [lon, lat]);
  }
  if (coords.length < 2) {
    return NextResponse.json({ error: "Las coordenadas no son válidas" }, { status: 400 });
  }

  const req: AnalyzeRequest = {
    coords,
    name: typeof body.name === "string" ? body.name.slice(0, 120) : undefined,
    departureMs:
      Number.isFinite(body.departureMs) && body.departureMs > 0
        ? Number(body.departureMs)
        : undefined,
    flexHours: Number.isFinite(body.flexHours) ? Number(body.flexHours) : 3,
    tzOffsetMinutes:
      Number.isFinite(body.tzOffsetMinutes) && Math.abs(body.tzOffsetMinutes) <= 840
        ? Number(body.tzOffsetMinutes)
        : 0,
    rider: sanitizeRider(body.rider),
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("deadline")), 38_000);
  try {
    return NextResponse.json(await analyze(req, ac.signal));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const abortado = ac.signal.aborted || /abort/i.test(message);
    return NextResponse.json(
      {
        error: abortado
          ? "El análisis ha tardado demasiado. Prueba con una ruta más corta."
          : message,
      },
      { status: abortado ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
