import { NextResponse } from "next/server";
import { plan } from "@/lib/planner";
import type { PlanRequest, Shape, Surface, WindMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SHAPES: Shape[] = ["circular", "lineal"];
const SURFACES: Surface[] = ["carretera", "camino", "mixto"];
const MODES: WindMode[] = ["tailwind_home", "min_effort", "hard_first"];

function isLonLat(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!isLonLat(body.start)) {
    return NextResponse.json({ error: "Falta el punto de salida" }, { status: 400 });
  }
  const shape: Shape = SHAPES.includes(body.shape) ? body.shape : "circular";
  if (shape === "lineal" && !isLonLat(body.end)) {
    return NextResponse.json(
      { error: "Una ruta lineal necesita punto de llegada" },
      { status: 400 }
    );
  }
  const distanceKm = Number(body.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm < 5 || distanceKm > 400) {
    return NextResponse.json(
      { error: "La distancia debe estar entre 5 y 400 km" },
      { status: 400 }
    );
  }

  const req: PlanRequest = {
    start: body.start,
    end: shape === "lineal" ? body.end : undefined,
    shape,
    distanceKm,
    surface: SURFACES.includes(body.surface) ? body.surface : "mixto",
    windMode: MODES.includes(body.windMode) ? body.windMode : "tailwind_home",
    departureMs:
      Number.isFinite(body.departureMs) && body.departureMs > 0
        ? Number(body.departureMs)
        : undefined,
    flexHours: Number.isFinite(body.flexHours) ? Number(body.flexHours) : 3,
    rider: typeof body.rider === "object" && body.rider ? body.rider : undefined,
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);
  try {
    const result = await plan(req, ac.signal);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /abort/i.test(message) ? 504 : 502;
    return NextResponse.json({ error: message }, { status });
  } finally {
    clearTimeout(timer);
  }
}
