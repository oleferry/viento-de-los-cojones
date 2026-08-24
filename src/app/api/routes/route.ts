import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deleteRoute, getRoute, listRoutes, saveRoute, setRouteNotify } from "@/lib/account";
import { requestI18n } from "@/lib/i18nServer";
import type { Surface, WindMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURFACES: Surface[] = ["carretera", "camino", "mixto"];
const MODES: WindMode[] = ["tailwind_home", "min_effort", "hard_first"];

const sinSesion = (t: (k: string) => string) =>
  NextResponse.json({ error: t("mustSignIn") }, { status: 401 });

/** Sin `id` devuelve el listado; con `id`, la ruta entera con su geometria. */
export async function GET(request: Request) {
  const { t } = await requestI18n(request);
  const userId = await currentUserId();
  if (!userId) return sinSesion(t);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ routes: await listRoutes(userId) });

  const route = await getRoute(userId, id);
  if (!route) return NextResponse.json({ error: t("notFound") }, { status: 404 });
  return NextResponse.json({ route });
}

export async function POST(request: Request) {
  const { t } = await requestI18n(request);
  const userId = await currentUserId();
  if (!userId) return sinSesion(t);

  try {
    const body = await request.json();
    const raw = body.coords;
    if (!Array.isArray(raw) || raw.length < 2) {
      return NextResponse.json({ error: t("routeNoGeometry") }, { status: 400 });
    }
    if (raw.length > 20000) {
      return NextResponse.json({ error: t("tooManyPoints") }, { status: 400 });
    }

    // Se guarda con tres decimales de metro: mas precision no cabe en un GPS
    // y multiplica el tamano de la fila.
    const coords: number[][] = [];
    for (const p of raw) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const lon = Number(p[0]);
      const lat = Number(p[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
      const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
      const ele = Number(p[2]);
      coords.push(
        Number.isFinite(ele) ? [r(lon, 6), r(lat, 6), r(ele, 1)] : [r(lon, 6), r(lat, 6)]
      );
    }
    if (coords.length < 2) {
      return NextResponse.json({ error: t("badCoords") }, { status: 400 });
    }

    if ((await listRoutes(userId)).length >= 200) {
      return NextResponse.json(
        { error: t("tooManyRoutes") },
        { status: 400 }
      );
    }

    const route = await saveRoute(userId, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : t("route"),
      kind: body.kind === "imported" ? "imported" : "planned",
      distanceM: Number(body.distanceM) || 0,
      ascentM: Number.isFinite(body.ascentM) ? Number(body.ascentM) : null,
      coords,
      surface: SURFACES.includes(body.surface) ? body.surface : undefined,
      windMode: MODES.includes(body.windMode) ? body.windMode : undefined,
      meta: typeof body.meta === "object" && body.meta ? body.meta : {},
    });
    return NextResponse.json({ route, routes: await listRoutes(userId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : t("couldNotSave") },
      { status: 500 }
    );
  }
}

/** Por ahora solo cambia el aviso por correo; pensado para crecer si hace falta. */
export async function PATCH(request: Request) {
  const { t, locale } = await requestI18n(request);
  const userId = await currentUserId();
  if (!userId) return sinSesion(t);

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: t("missingId") }, { status: 400 });
  if (typeof body.notify !== "boolean") {
    return NextResponse.json({ error: t("missingNotify") }, { status: 400 });
  }

  await setRouteNotify(userId, id, body.notify, locale);
  return NextResponse.json({ routes: await listRoutes(userId) });
}

export async function DELETE(request: Request) {
  const { t } = await requestI18n(request);
  const userId = await currentUserId();
  if (!userId) return sinSesion(t);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: t("missingId") }, { status: 400 });
  await deleteRoute(userId, id);
  return NextResponse.json({ routes: await listRoutes(userId) });
}
