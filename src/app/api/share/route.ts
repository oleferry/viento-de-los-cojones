import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { pickLocale, serverI18n } from "@/lib/i18nServer";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { createShare } from "@/lib/share";
import type { Surface, WindMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURFACES: Surface[] = ["carretera", "camino", "mixto"];
const MODES: WindMode[] = ["tailwind_home", "min_effort", "hard_first"];

// Mas estricto que el resto de la API a proposito: este es el unico endpoint
// que acepta ESCRITURAS de gente sin cuenta, asi que es el candidato obvio a
// que alguien lo use para llenar la tabla. Diez por minuto sobran para una
// persona compartiendo rutas.
const SHARE_LIMIT = 10;
const SHARE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { t } = await serverI18n(pickLocale(body?.locale));

  if (!dbEnabled) {
    return NextResponse.json({ error: t("shareUnavailable") }, { status: 503 });
  }

  const rl = rateLimit(`share:${clientIp(request)}`, SHARE_LIMIT, SHARE_WINDOW_MS);
  if (rl.limited) {
    return NextResponse.json(
      { error: t("tooManyShares") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }
    );
  }

  const raw = body.coords;
  if (!Array.isArray(raw) || raw.length < 2) {
    return NextResponse.json({ error: t("routeNoGeometry") }, { status: 400 });
  }
  if (raw.length > 20000) {
    return NextResponse.json({ error: t("tooManyPoints") }, { status: 400 });
  }

  // Mismo recorte que al guardar en la cuenta: mas precision no cabe en un GPS
  // y multiplica el tamano de la fila.
  const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  const coords: number[][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const ele = Number(p[2]);
    coords.push(
      Number.isFinite(ele) ? [r(lon, 6), r(lat, 6), r(ele, 1)] : [r(lon, 6), r(lat, 6)]
    );
  }
  if (coords.length < 2) {
    return NextResponse.json({ error: t("badCoords") }, { status: 400 });
  }

  try {
    const id = await createShare({
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : t("route"),
      coords,
      distanceM: Number(body.distanceM) || 0,
      ascentM: Number.isFinite(body.ascentM) ? Number(body.ascentM) : null,
      surface: SURFACES.includes(body.surface) ? body.surface : undefined,
      windMode: MODES.includes(body.windMode) ? body.windMode : undefined,
      // Solo para que quien tenga cuenta pueda reconocer lo suyo; compartir
      // no la exige.
      userId: await currentUserId(),
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : t("couldNotSave") },
      { status: 500 }
    );
  }
}
