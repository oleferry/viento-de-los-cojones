import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Diagnostico de los servicios externos, medido DESDE donde corre la funcion.
 * La latencia desde un portatil en Espana no dice nada de la latencia desde el
 * centro de datos donde Vercel ejecuta esto, y esa diferencia es justo la que
 * convierte un plan de 1,3 s en uno de 60.
 */
const START: [number, number] = [-5.027, 42.093];
const VIA: [number, number] = [-4.95, 42.15];

async function timed(name: string, url: string, init?: RequestInit) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "ondivento/diag", ...(init?.headers ?? {}) },
    });
    const body = await res.text();
    return {
      name,
      ms: Date.now() - t0,
      status: res.status,
      bytes: body.length,
      ok: res.ok,
      muestra: res.ok ? undefined : body.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (err) {
    return {
      name,
      ms: Date.now() - t0,
      status: 0,
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

export async function GET() {
  const lonlats = [START, VIA, START]
    .map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`)
    .join("|");
  const osrmPath = [START, VIA, START]
    .map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`)
    .join(";");

  // En serie y a proposito: queremos la latencia de cada uno por separado,
  // no la del conjunto.
  const results = [];
  results.push(
    await timed(
      "open-meteo",
      "https://api.open-meteo.com/v1/forecast?latitude=42.09&longitude=-5.03&hourly=wind_speed_10m&forecast_hours=48"
    )
  );
  results.push(
    await timed(
      "brouter",
      `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=fastbike&alternativeidx=0&format=geojson`
    )
  );
  results.push(
    await timed(
      "osrm-fossgis",
      `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${osrmPath}?overview=full&geometries=geojson`
    )
  );
  if (process.env.ORS_API_KEY) {
    results.push(
      await timed("openrouteservice", `https://api.openrouteservice.org/v2/directions/cycling-road/geojson`, {
        method: "POST",
        headers: {
          Authorization: process.env.ORS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ coordinates: [START, VIA, START] }),
      })
    );
  }

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? "local",
    tieneClaveOrs: !!process.env.ORS_API_KEY,
    results,
  });
}
