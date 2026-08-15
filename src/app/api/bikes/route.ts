import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deleteBike, listBikes, saveBike, setDefaultBike } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinSesion = () =>
  NextResponse.json({ error: "Hay que entrar primero" }, { status: 401 });

export async function GET() {
  const id = await currentUserId();
  if (!id) return sinSesion();
  return NextResponse.json({ bikes: await listBikes(id) });
}

export async function POST(request: Request) {
  const id = await currentUserId();
  if (!id) return sinSesion();
  try {
    const body = await request.json();
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "La bici necesita un nombre" }, { status: 400 });
    }
    // El límite evita que una cuenta llene la tabla sin querer.
    if (!body.id && (await listBikes(id)).length >= 12) {
      return NextResponse.json({ error: "Ya tienes 12 bicis guardadas" }, { status: 400 });
    }
    const bike = await saveBike(id, { ...body, name: body.name.trim() });
    if (body.makeDefault) await setDefaultBike(id, bike.id);
    return NextResponse.json({ bikes: await listBikes(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se ha podido guardar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const id = await currentUserId();
  if (!id) return sinSesion();
  const bikeId = new URL(request.url).searchParams.get("id");
  if (!bikeId) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  await deleteBike(id, bikeId);
  return NextResponse.json({ bikes: await listBikes(id) });
}
