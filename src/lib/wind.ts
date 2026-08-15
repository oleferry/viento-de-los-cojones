import type { LonLat, WindSample } from "./types";
import { haversine, toDeg, toRad } from "./geo";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const HOURLY = [
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "temperature_2m",
  "precipitation_probability",
].join(",");

interface StationSeries {
  lon: number;
  lat: number;
  /** Componente este del vector de avance del viento (m/s). */
  u: number[];
  /** Componente norte del vector de avance del viento (m/s). */
  v: number[];
  gust: number[];
  temp: number[];
  precip: number[];
}

export class WindField {
  readonly times: number[]; // epoch ms, paso horario
  readonly utcOffsetSeconds: number;
  readonly timezone: string;
  private stations: StationSeries[];

  constructor(
    times: number[],
    stations: StationSeries[],
    utcOffsetSeconds: number,
    timezone: string
  ) {
    this.times = times;
    this.stations = stations;
    this.utcOffsetSeconds = utcOffsetSeconds;
    this.timezone = timezone;
  }

  get start(): number {
    return this.times[0];
  }
  get end(): number {
    return this.times[this.times.length - 1];
  }

  /** Indice fraccionario dentro de la serie horaria, saturado a los extremos. */
  private timeIndex(epochMs: number): { i0: number; i1: number; f: number } {
    const n = this.times.length;
    if (n === 1) return { i0: 0, i1: 0, f: 0 };
    const stepMs = this.times[1] - this.times[0];
    const raw = (epochMs - this.times[0]) / stepMs;
    const clamped = Math.max(0, Math.min(n - 1, raw));
    const i0 = Math.min(n - 2, Math.floor(clamped));
    return { i0, i1: i0 + 1, f: clamped - i0 };
  }

  /**
   * Viento en un punto e instante cualesquiera. Interpola en el tiempo
   * linealmente y en el espacio por distancia inversa al cuadrado, siempre
   * sobre las COMPONENTES del vector: promediar grados directamente daria
   * disparates cuando el viento cruza el norte (350 y 10 no promedian a 180).
   */
  sample(lon: number, lat: number, epochMs: number): WindSample {
    const { i0, i1, f } = this.timeIndex(epochMs);
    let wsum = 0;
    let u = 0, v = 0, gust = 0, temp = 0, precip = 0;

    for (const s of this.stations) {
      const d = haversine([lon, lat], [s.lon, s.lat]);
      const w = 1 / (d * d + 1e4); // +100 m de suavizado para no dividir por cero
      wsum += w;
      u += w * (s.u[i0] + (s.u[i1] - s.u[i0]) * f);
      v += w * (s.v[i0] + (s.v[i1] - s.v[i0]) * f);
      gust += w * (s.gust[i0] + (s.gust[i1] - s.gust[i0]) * f);
      temp += w * (s.temp[i0] + (s.temp[i1] - s.temp[i0]) * f);
      precip += w * (s.precip[i0] + (s.precip[i1] - s.precip[i0]) * f);
    }
    u /= wsum;
    v /= wsum;

    const speed = Math.hypot(u, v);
    const towardDeg = (toDeg(Math.atan2(u, v)) + 360) % 360;
    return {
      speed10: speed,
      fromDeg: (towardDeg + 180) % 360,
      gust: gust / wsum,
      tempC: temp / wsum,
      precipProb: precip / wsum,
    };
  }

  /** Serie horaria completa en un punto, para pintar la grafica. */
  seriesAt(lon: number, lat: number) {
    return this.times.map((t) => {
      const s = this.sample(lon, lat, t);
      return {
        time: new Date(t).toISOString(),
        speed10: s.speed10,
        fromDeg: s.fromDeg,
        gust: s.gust,
      };
    });
  }
}

function num(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/**
 * Descarga la previsión horaria de Open-Meteo para varios puntos en una sola
 * petición (la API acepta coordenadas separadas por comas) y devuelve un campo
 * de viento interpolable.
 */
export async function fetchWindField(
  points: LonLat[],
  forecastDays = 3,
  signal?: AbortSignal
): Promise<WindField> {
  const url = new URL(OPEN_METEO);
  url.searchParams.set("latitude", points.map((p) => p[1].toFixed(4)).join(","));
  url.searchParams.set("longitude", points.map((p) => p[0].toFixed(4)).join(","));
  url.searchParams.set("hourly", HOURLY);
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", String(Math.max(1, Math.min(16, forecastDays))));
  url.searchParams.set("past_hours", "1");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Open-Meteo respondio ${res.status}: ${await res.text()}`);
  }
  const raw = await res.json();
  const list: any[] = Array.isArray(raw) ? raw : [raw];
  if (!list.length || !list[0]?.hourly?.time) {
    throw new Error("Open-Meteo no devolvio serie horaria");
  }

  // Con timezone=UTC las marcas llegan como "2026-08-15T08:00" (sin sufijo).
  const times: number[] = list[0].hourly.time.map((t: string) =>
    Date.parse(t.endsWith("Z") ? t : `${t}:00Z`)
  );

  const stations: StationSeries[] = list.map((loc, idx) => {
    const h = loc.hourly ?? {};
    const speeds: number[] = h.wind_speed_10m ?? [];
    const dirs: number[] = h.wind_direction_10m ?? [];
    const u: number[] = [];
    const v: number[] = [];
    for (let i = 0; i < times.length; i++) {
      const sp = num(speeds[i]);
      const towardRad = toRad((num(dirs[i]) + 180) % 360);
      u.push(sp * Math.sin(towardRad));
      v.push(sp * Math.cos(towardRad));
    }
    return {
      lon: num(loc.longitude ?? points[idx]?.[0]),
      lat: num(loc.latitude ?? points[idx]?.[1]),
      u,
      v,
      gust: (h.wind_gusts_10m ?? []).map(num),
      temp: (h.temperature_2m ?? []).map(num),
      precip: (h.precipitation_probability ?? []).map(num),
    };
  });

  return new WindField(times, stations, 0, "UTC");
}

/** Altitud del terreno para una lista de puntos (max. 100 por petición). */
export async function fetchElevations(
  coords: number[][],
  signal?: AbortSignal
): Promise<number[] | null> {
  if (!coords.length) return null;
  try {
    const url = new URL("https://api.open-meteo.com/v1/elevation");
    url.searchParams.set("latitude", coords.map((c) => c[1].toFixed(5)).join(","));
    url.searchParams.set("longitude", coords.map((c) => c[0].toFixed(5)).join(","));
    const res = await fetch(url.toString(), { signal, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const el = data?.elevation;
    return Array.isArray(el) && el.length === coords.length ? el.map(num) : null;
  } catch {
    return null;
  }
}

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

/** Rumbo en grados -> punto cardinal en castellano (O de Oeste, no W). */
export function cardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}
