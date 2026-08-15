import type { LonLat, RouteGeometry, Surface } from "./types";
import { polylineLength } from "./geo";

export type Provider = "ors" | "brouter" | "osrm";

const ORS_BASE = "https://api.openrouteservice.org";
const BROUTER_BASE = "https://brouter.de/brouter";
const OSRM_BASE = "https://routing.openstreetmap.de";
const UA = "viento-de-los-cojones/0.1 (planificador de rutas ciclistas)";

/** Codigos de firme de ORS que consideramos pavimento rodable con bici de carretera. */
const ORS_PAVED = new Set([1, 3, 4, 5, 6, 7, 14]);
const ORS_SURFACE_NAMES: Record<number, string> = {
  0: "desconocido",
  1: "pavimentado",
  2: "sin pavimentar",
  3: "asfalto",
  4: "hormigon",
  5: "adoquin",
  6: "metal",
  7: "madera",
  8: "zahorra compactada",
  9: "grava fina",
  10: "grava",
  11: "tierra",
  12: "terreno natural",
  13: "hielo",
  14: "adoquinado",
  15: "arena",
  16: "astillas",
  17: "hierba",
  18: "hierba con losa",
};

/**
 * Orden de preferencia. Se prueban en cadena: si uno se cae o satura, se pasa
 * al siguiente en vez de tumbar el plan entero. Los tres publicos aguantan uso
 * moderado, pero ninguno garantiza nada, y de tanto en tanto uno de ellos deja
 * de responder.
 */
export function providerChain(): Provider[] {
  const forced = process.env.ROUTING_PROVIDER?.toLowerCase();
  const all: Provider[] = process.env.ORS_API_KEY
    ? ["ors", "brouter", "osrm"]
    : ["brouter", "osrm"];
  if (forced === "ors" || forced === "brouter" || forced === "osrm") {
    return [forced, ...all.filter((p) => p !== forced)];
  }
  return all;
}

export function pickProvider(): Provider {
  return providerChain()[0];
}

export function orsProfile(surface: Surface): string {
  switch (surface) {
    case "carretera":
      return "cycling-road";
    case "camino":
      return "cycling-mountain";
    default:
      return "cycling-regular";
  }
}

/** BRouter tiene perfiles que encajan casi uno a uno con lo que pedimos. */
export function brouterProfile(surface: Surface): string {
  switch (surface) {
    case "carretera":
      return "fastbike";
    case "camino":
      return "gravel";
    default:
      return "trekking";
  }
}

export function profileLabel(provider: Provider, surface: Surface): string {
  if (provider === "ors") return `openrouteservice/${orsProfile(surface)}`;
  if (provider === "brouter") return `brouter/${brouterProfile(surface)}`;
  return "osrm/routed-bike";
}

/** Limitador de concurrencia minimo, para no reventar el rate limit del proveedor. */
export function pLimit(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

export class RoutingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RoutingError";
  }
}

/** Codigos que merecen otro intento: el servidor esta saturado, no roto. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tiempo maximo por peticion a un proveedor. Sin esto, uno que se quede colgado
 * bloquea el plan entero hasta que la plataforma mata la funcion, y el usuario
 * recibe una pagina de error en HTML en vez de una respuesta. Mas vale rendirse
 * pronto y pasar al siguiente de la cadena.
 */
const REQUEST_TIMEOUT_MS = 9_000;

/**
 * Combina el AbortSignal de quien llama con un limite de tiempo propio, sin
 * depender de AbortSignal.any/timeout para no atarnos a una version de Node.
 */
function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ac = new AbortController();
  const onAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return {
    signal: ac.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** Igual que fetch, pero se rinde a los `ms` milisegundos. */
async function fetchLimited(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  ms = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const t = withTimeout(signal, ms);
  try {
    return await fetch(url, { ...init, signal: t.signal });
  } catch (err) {
    if (t.signal.aborted && !signal?.aborted) {
      throw new RoutingError(`sin respuesta en ${Math.round(ms / 1000)} s`, 504);
    }
    throw err;
  } finally {
    t.done();
  }
}

/**
 * Reintenta con espera creciente. El OSRM publico de FOSSGIS devuelve 502 con
 * facilidad cuando le llegan varias peticiones seguidas, y sin esto un unico
 * hipo se lleva por delante todo el plan.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  baseMs = 400
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = err instanceof RoutingError ? err.status : undefined;
      const retryable = status == null || RETRYABLE.has(status);
      if (!retryable || i === attempts - 1) break;
      // Escalonado y con algo de dispersion, para no reintentar todos a la vez.
      await sleep(baseMs * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
  throw last;
}

async function routeORS(
  waypoints: LonLat[],
  surface: Surface,
  signal?: AbortSignal
): Promise<RouteGeometry> {
  const key = process.env.ORS_API_KEY;
  if (!key) throw new RoutingError("Falta ORS_API_KEY");
  const profile = orsProfile(surface);
  const res = await fetchLimited(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/geo+json",
      "User-Agent": UA,
    },
    body: JSON.stringify({
      coordinates: waypoints,
      elevation: true,
      instructions: false,
      extra_info: ["surface", "waytype", "steepness"],
      continue_straight: false,
      radiuses: waypoints.map(() => 5000),
      options: { avoid_features: ["ferries"] },
    }),
  }, signal);

  if (!res.ok) {
    const body = await res.text();
    throw new RoutingError(`ORS ${res.status}: ${body.slice(0, 400)}`, res.status);
  }
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat?.geometry?.coordinates?.length) {
    throw new RoutingError("ORS no devolvio geometria");
  }
  const coords: number[][] = feat.geometry.coordinates;
  const props = feat.properties ?? {};
  const distanceM = props.summary?.distance ?? polylineLength(coords);

  let surfaceBreakdown: Record<string, number> | undefined;
  let pavedFrac: number | undefined;
  const summary = props.extras?.surface?.summary;
  if (Array.isArray(summary) && summary.length) {
    surfaceBreakdown = {};
    let paved = 0;
    let total = 0;
    for (const row of summary) {
      const name = ORS_SURFACE_NAMES[row.value] ?? `codigo ${row.value}`;
      surfaceBreakdown[name] = (surfaceBreakdown[name] ?? 0) + (row.distance ?? 0);
      total += row.distance ?? 0;
      if (ORS_PAVED.has(row.value)) paved += row.distance ?? 0;
    }
    pavedFrac = total > 0 ? paved / total : undefined;
  }

  return {
    coords,
    distanceM,
    ascentM: props.ascent,
    surfaceBreakdown,
    pavedFrac,
  };
}

/**
 * BRouter, el enrutador que usa media Europa ciclista. No pide clave, entiende
 * de firmes y devuelve la altimetria en la propia geometria, asi que con el no
 * hace falta ir a buscarla aparte.
 */
async function routeBRouter(
  waypoints: LonLat[],
  surface: Surface,
  signal?: AbortSignal
): Promise<RouteGeometry> {
  const url = new URL(BROUTER_BASE);
  url.searchParams.set(
    "lonlats",
    waypoints.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join("|")
  );
  url.searchParams.set("profile", brouterProfile(surface));
  url.searchParams.set("alternativeidx", "0");
  url.searchParams.set("format", "geojson");

  const res = await fetchLimited(
    url.toString(),
    { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } },
    signal
  );
  if (!res.ok) {
    throw new RoutingError(
      `BRouter ${res.status}: ${(await res.text()).slice(0, 300)}`,
      res.status
    );
  }
  const data = await res.json();
  const feat = data?.features?.[0];
  const coords: number[][] | undefined = feat?.geometry?.coordinates;
  if (!coords?.length) throw new RoutingError("BRouter no devolvio geometria");

  const props = feat.properties ?? {};
  const distanceM = Number(props["track-length"]) || polylineLength(coords);
  const ascentM = Number(props["filtered ascend"]);

  return {
    coords,
    distanceM,
    ascentM: Number.isFinite(ascentM) ? ascentM : undefined,
  };
}

async function routeOSRM(
  waypoints: LonLat[],
  signal?: AbortSignal
): Promise<RouteGeometry> {
  const path = waypoints.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(";");
  const url =
    `${OSRM_BASE}/routed-bike/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&continue_straight=false&alternatives=false&steps=false`;
  const res = await fetchLimited(
    url,
    { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } },
    signal
  );
  if (!res.ok) {
    throw new RoutingError(`OSRM ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  }
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) {
    throw new RoutingError(`OSRM sin ruta (${data?.code ?? "sin codigo"})`);
  }
  return {
    coords: route.geometry.coordinates,
    distanceM: route.distance ?? polylineLength(route.geometry.coordinates),
  };
}

function routeWith(
  provider: Provider,
  waypoints: LonLat[],
  surface: Surface,
  signal?: AbortSignal
): Promise<RouteGeometry> {
  if (provider === "ors") return routeORS(waypoints, surface, signal);
  if (provider === "brouter") return routeBRouter(waypoints, surface, signal);
  return routeOSRM(waypoints, signal);
}

export interface RouteResult extends RouteGeometry {
  provider: Provider;
}

/**
 * Enruta probando los proveedores en cadena. Todos son servicios publicos y
 * gratuitos, y cualquiera puede estar saturado en un momento dado; encadenarlos
 * es la diferencia entre "no se pudo trazar la ruta" y que salga igualmente.
 */
export async function route(
  waypoints: LonLat[],
  surface: Surface,
  chain: Provider[],
  signal?: AbortSignal
): Promise<RouteResult> {
  if (waypoints.length < 2) throw new RoutingError("Hacen falta al menos 2 puntos");
  let last: unknown;
  for (const provider of chain) {
    try {
      const geom = await withRetry(() => routeWith(provider, waypoints, surface, signal));
      return { ...geom, provider };
    } catch (err) {
      last = err;
      if (signal?.aborted) break;
    }
  }
  throw last instanceof Error ? last : new RoutingError(String(last));
}

export interface GeocodeHit {
  label: string;
  lon: number;
  lat: number;
  region?: string;
}

/** Busqueda de lugares. Usa Pelias (ORS) si hay clave; si no, Nominatim. */
export async function geocode(text: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const key = process.env.ORS_API_KEY;
  if (key) {
    const url = new URL(`${ORS_BASE}/geocode/search`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("text", text);
    url.searchParams.set("boundary.country", "ES");
    url.searchParams.set("size", "8");
    const res = await fetch(url.toString(), { signal, headers: { "User-Agent": UA } });
    if (res.ok) {
      const data = await res.json();
      const hits: GeocodeHit[] = (data?.features ?? []).map((f: any) => ({
        label: f.properties?.label ?? f.properties?.name ?? text,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        region: f.properties?.region,
      }));
      if (hits.length) return hits;
    }
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", text);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "es");
  url.searchParams.set("limit", "8");
  const res = await fetch(url.toString(), {
    signal,
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((d: any) => ({
    label: d.display_name as string,
    lon: Number(d.lon),
    lat: Number(d.lat),
  }));
}
