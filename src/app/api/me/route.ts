import { NextResponse } from "next/server";
import { auth, authAvailable } from "@/lib/auth";
import {
  DEFAULT_PROFILE,
  getProfile,
  listBikes,
  saveProfile,
  type Profile,
} from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITES: Record<keyof Profile, [number, number] | null> = {
  heightCm: [130, 215],
  massKg: [35, 200],
  ftpW: [80, 500],
  intensity: [0.4, 1.05],
  position: null,
};
const POSTURAS = new Set(["tops", "hoods", "drops", "aero"]);

function limpiar(raw: unknown): Profile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PROFILE };
  for (const [k, rango] of Object.entries(LIMITES)) {
    if (!rango) continue;
    const v = Number(r[k]);
    if (Number.isFinite(v) && v >= rango[0] && v <= rango[1]) {
      (out as unknown as Record<string, number>)[k] = v;
    }
  }
  if (typeof r.position === "string" && POSTURAS.has(r.position)) {
    out.position = r.position;
  }
  return out;
}

/** Quien soy, mi perfil y mis bicis. Siempre responde, con sesion o sin ella. */
export async function GET() {
  if (!authAvailable) {
    return NextResponse.json({ authAvailable: false, user: null });
  }
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ authAvailable: true, user: null });

  const [profile, bikes] = await Promise.all([getProfile(id), listBikes(id)]);
  return NextResponse.json({
    authAvailable: true,
    user: {
      name: session.user?.name ?? null,
      email: session.user?.email ?? null,
      image: session.user?.image ?? null,
    },
    profile,
    bikes,
  });
}

export async function PUT(request: Request) {
  const session = authAvailable ? await auth() : null;
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Hay que entrar primero" }, { status: 401 });

  try {
    const body = await request.json();
    return NextResponse.json({ profile: await saveProfile(id, limpiar(body)) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se ha podido guardar" },
      { status: 500 }
    );
  }
}
