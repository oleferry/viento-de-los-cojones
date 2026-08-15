import { NextResponse } from "next/server";
import { plan } from "@/lib/planner";
import type { PlanRequest, Shape, Surface, WindMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SHAPES: Shape[] = ["circular", "lineal"];
const SURFACES: Surface[] = ["carretera", "camino", "mixto"];
const MODES: WindMode[] = ["tailwind_home", "min_effort", "hard_first"];

/** Rangos plausibles para el perfil del ciclista: fuera de esto se ignora. */
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
    tzOffsetMinutes:
      Number.isFinite(body.tzOffsetMinutes) && Math.abs(body.tzOffsetMinutes) <= 840
        ? Number(body.tzOffsetMinutes)
        : 0,
    rider: sanitizeRider(body.rider),
  };

  // Muy por debajo del limite de la plataforma (60 s). Si se apura hasta el
  // final, quien corta es Vercel y devuelve una pagina de error en texto plano;
  // el navegador intenta parsearla como JSON y salta
  // "Unexpected token 'A', \"An error o\"...". Rindiendonos antes, el error
  // siempre sale como JSON y se puede explicar.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("deadline")), 38_000);
  try {
    const result = await plan(req, ac.signal);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const abortado = ac.signal.aborted || /abort/i.test(message);
    return NextResponse.json(
      {
        error: abortado
          ? "Los servidores de rutas están tardando demasiado. Prueba otra vez, o con menos distancia."
          : message,
      },
      { status: abortado ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
