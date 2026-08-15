import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deleteRoute, getRoute, listRoutes, saveRoute } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinSesion = () =>
  NextResponse.json({ error: "Hay que entrar primero" }, { status: 401 });

/** Sin `id` devuelve el listado; con `id`, la ruta entera con su geometria. */
export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return sinSesion();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ routes: await listRoutes(userId) });

  const route = await getRoute(userId, id);
  if (!route) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json({ route });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return sinSesion();

  try {
    const body = await request.json();
    const raw = body.coords;
    if (!Array.isArray(raw) || raw.length < 2) {
      return NextResponse.json({ error: "La ruta no tiene geometría" }, { status: 400 });
    }
    if (raw.length > 20000) {
      return NextResponse.json({ error: "La ruta tiene demasiados puntos" }, { status: 400 });
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
      return NextResponse.json({ error: "Las coordenadas no son válidas" }, { status: 400 });
    }

    if ((await listRoutes(userId)).length >= 200) {
      return NextResponse.json(
        { error: "Ya tienes 200 rutas guardadas. Borra alguna antes." },
        { status: 400 }
      );
    }

    const route = await saveRoute(userId, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Ruta",
      kind: body.kind === "imported" ? "imported" : "planned",
      distanceM: Number(body.distanceM) || 0,
      ascentM: Number.isFinite(body.ascentM) ? Number(body.ascentM) : null,
      coords,
      meta: typeof body.meta === "object" && body.meta ? body.meta : {},
    });
    return NextResponse.json({ route, routes: await listRoutes(userId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se ha podido guardar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return sinSesion();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  await deleteRoute(userId, id);
  return NextResponse.json({ routes: await listRoutes(userId) });
}
