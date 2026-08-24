import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deleteBike, listBikes, saveBike, setDefaultBike } from "@/lib/account";
import { requestI18n } from "@/lib/i18nServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinSesion = (t: (k: string) => string) =>
  NextResponse.json({ error: t("mustSignIn") }, { status: 401 });

export async function GET(request: Request) {
  const { t } = await requestI18n(request);
  const id = await currentUserId();
  if (!id) return sinSesion(t);
  return NextResponse.json({ bikes: await listBikes(id) });
}

export async function POST(request: Request) {
  const { t } = await requestI18n(request);
  const id = await currentUserId();
  if (!id) return sinSesion(t);
  try {
    const body = await request.json();
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: t("bikeNeedsName") }, { status: 400 });
    }
    // El límite evita que una cuenta llene la tabla sin querer.
    if (!body.id && (await listBikes(id)).length >= 12) {
      return NextResponse.json({ error: t("tooManyBikes") }, { status: 400 });
    }
    const bike = await saveBike(id, { ...body, name: body.name.trim() });
    if (body.makeDefault) await setDefaultBike(id, bike.id);
    return NextResponse.json({ bikes: await listBikes(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : t("couldNotSave") },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { t } = await requestI18n(request);
  const id = await currentUserId();
  if (!id) return sinSesion(t);
  const bikeId = new URL(request.url).searchParams.get("id");
  if (!bikeId) return NextResponse.json({ error: t("missingId") }, { status: 400 });
  await deleteBike(id, bikeId);
  return NextResponse.json({ bikes: await listBikes(id) });
}
