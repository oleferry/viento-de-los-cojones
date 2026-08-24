import { NextResponse } from "next/server";
import { geocode } from "@/lib/routing";
import { pickLocale, serverI18n } from "@/lib/i18nServer";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nominatim, el respaldo sin clave, pide explicitamente no pasar de 1
// peticion por segundo y nada de uso automatizado pesado. El buscador ya
// espera 350 ms sin teclear antes de llamar; esto es para quien se salte
// esa espera desde fuera del formulario.
const GEOCODE_LIMIT = 30;
const GEOCODE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const text = params.get("q")?.trim();
  if (!text || text.length < 3) return NextResponse.json({ results: [] });

  const ip = clientIp(request);
  const rl = rateLimit(`geocode:${ip}`, GEOCODE_LIMIT, GEOCODE_WINDOW_MS);
  if (rl.limited) {
    const { t } = await serverI18n(pickLocale(params.get("locale")));
    return NextResponse.json(
      { results: [], error: t("tooManySearches") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }
    );
  }

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
