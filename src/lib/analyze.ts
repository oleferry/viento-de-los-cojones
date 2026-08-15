import type {
  AnalyzeRequest,
  Candidate,
  HourOption,
  LonLat,
  PlanResponse,
  RiderProfile,
  Segment,
  TrackPoint,
} from "./types";
import {
  bbox,
  destination,
  haversine,
  overlapFraction,
  polylineLength,
  resample,
  samplingGrid,
  toSegments,
  uTurns,
} from "./geo";
import { DEFAULT_RIDER, evaluateRoute } from "./physics";
import { fetchElevations, fetchWindField } from "./wind";

const SEGMENT_STEP_M = 400;
const OUTLOOK_DAYS = 5;

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const nextHour = (ms: number) => Math.ceil(ms / 3600000) * 3600000;

/**
 * Simula una ruta que trae la persona (GPX, TCX, KML).
 *
 * No traza nada: reutiliza el mismo motor de viento y potencia que el
 * planificador, asi que no gasta ni una peticion de enrutado. Es la otra mitad
 * util de la herramienta — "esta es mi ruta de siempre, ¿a que hora la hago
 * hoy?" — y responde con el mismo pronostico a cinco dias.
 */
export async function analyze(
  req: AnalyzeRequest,
  signal?: AbortSignal
): Promise<PlanResponse> {
  const rider: RiderProfile = { ...DEFAULT_RIDER, ...(req.rider ?? {}) };
  const flex = Math.max(0, Math.min(12, req.flexHours ?? 3));
  const baseMs = nextHour(req.departureMs ?? Date.now());
  const tz = (req.tzOffsetMinutes ?? 0) * 60000;
  const warnings: string[] = [];

  let coords = req.coords;
  const distanceM = polylineLength(coords);

  // --- viento sobre la caja de la ruta ------------------------------------
  const [minLon, minLat, maxLon, maxLat] = bbox(coords);
  const center: LonLat = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const spanM = Math.max(
    4000,
    haversine([minLon, minLat], [maxLon, maxLat]) / 2
  );
  const horizonHours =
    Math.ceil((baseMs - Date.now()) / 3600000) + flex + 14 + OUTLOOK_DAYS * 24;
  const wind = await fetchWindField(
    samplingGrid(center, spanM, 6),
    Math.max(30, Math.min(240, horizonHours)),
    signal
  );

  // --- altimetria si el fichero no la traia --------------------------------
  const traeEle = coords[0]?.length > 2;
  if (!traeEle) {
    const N = Math.min(100, coords.length);
    const idx = Array.from({ length: N }, (_, i) =>
      Math.round((i * (coords.length - 1)) / Math.max(1, N - 1))
    );
    const eles = await fetchElevations(idx.map((i) => coords[i]), signal);
    if (eles) {
      const conEle = coords.map((c) => [c[0], c[1], 0]);
      for (let k = 0; k < idx.length - 1; k++) {
        const a = idx[k];
        const b = idx[k + 1];
        const span = Math.max(1, b - a);
        for (let i = a; i <= b; i++) {
          conEle[i][2] = eles[k] + ((eles[k + 1] - eles[k]) * (i - a)) / span;
        }
      }
      coords = conEle;
    } else {
      warnings.push("Sin datos de altimetría: los tiempos ignoran las cuestas.");
    }
  }

  let ascentM = 0;
  if (coords[0]?.length > 2) {
    for (let i = 1; i < coords.length; i++) {
      const d = coords[i][2] - coords[i - 1][2];
      if (d > 0) ascentM += d;
    }
  }

  const muestreada = resample(coords, SEGMENT_STEP_M);
  const segsFwd = toSegments(muestreada);
  const segsRev = toSegments(muestreada.slice().reverse());
  // Un bucle se puede hacer en los dos sentidos, y con viento no da igual.
  const esBucle =
    haversine(
      [coords[0][0], coords[0][1]],
      [coords[coords.length - 1][0], coords[coords.length - 1][1]]
    ) < Math.max(500, distanceM * 0.02);

  const windAt = (lon: number, lat: number, epochMs: number) => {
    const s = wind.sample(lon, lat, epochMs);
    return { speed: s.speed10, fromDeg: s.fromDeg, rho: s.rho };
  };

  const evaluar = (segs: Segment[], dep: number) =>
    evaluateRoute(
      segs,
      (lon, lat, tSec) => windAt(lon, lat, dep + tSec * 1000),
      rider
    );

  // --- horas dentro del margen --------------------------------------------
  const departures: number[] = [];
  for (let d = -flex; d <= flex; d++) {
    const t = baseMs + d * 3600000;
    if (t >= wind.start && t <= wind.end - 3600000) departures.push(t);
  }
  if (!departures.length) {
    departures.push(Math.max(wind.start, Math.min(baseMs, wind.end - 3600000)));
  }

  const sentidos: { reversed: boolean; segs: Segment[] }[] = esBucle
    ? [
        { reversed: false, segs: segsFwd },
        { reversed: true, segs: segsRev },
      ]
    : [{ reversed: false, segs: segsFwd }];

  let mejor: { reversed: boolean; dep: number; ev: ReturnType<typeof evaluar> } | null =
    null;
  for (const s of sentidos) {
    for (const dep of departures) {
      const ev = evaluar(s.segs, dep);
      if (!mejor || ev.timeS < mejor.ev.timeS) {
        mejor = { reversed: s.reversed, dep, ev };
      }
    }
  }
  if (!mejor) throw new Error("No se ha podido simular la ruta");

  const construir = (
    reversed: boolean,
    dep: number,
    ev: ReturnType<typeof evaluar>,
    id: string,
    label: string
  ): Candidate => {
    const segs = reversed ? segsRev : segsFwd;
    const res = ev.segments ?? [];
    let elapsed = 0;
    const track: TrackPoint[] = segs.map((seg, i) => {
      const r = res[i];
      const p: TrackPoint = {
        lon: round(seg.lon, 5),
        lat: round(seg.lat, 5),
        hw: round(r?.headwind ?? 0, 2),
        yaw: round(r?.yaw ?? 0, 0),
        kmh: round((r?.speed ?? 0) * 3.6, 1),
        km: round(seg.cum / 1000, 2),
        min: round(elapsed / 60, 1),
        wd: round(r?.windFromDeg ?? 0, 0),
        ws: round(r?.windMs ?? 0, 2),
        brg: round(seg.bearing, 0),
        ele: seg.ele != null ? round(seg.ele, 0) : undefined,
      };
      elapsed += r?.time ?? 0;
      return p;
    });
    const last = segs[segs.length - 1];
    if (last) {
      const end = destination([last.lon, last.lat], last.bearing, last.len);
      const lr = res[res.length - 1];
      track.push({
        lon: round(end[0], 5),
        lat: round(end[1], 5),
        hw: round(lr?.headwind ?? 0, 2),
        yaw: round(lr?.yaw ?? 0, 0),
        kmh: round((lr?.speed ?? 0) * 3.6, 1),
        km: round((last.cum + last.len) / 1000, 2),
        min: round(elapsed / 60, 1),
        wd: round(lr?.windFromDeg ?? 0, 0),
        ws: round(lr?.windMs ?? 0, 2),
        brg: round(last.bearing, 0),
        ele: last.ele != null ? round(last.ele, 0) : undefined,
      });
    }
    const { segments: _drop, ...evaluation } = ev;
    return {
      id,
      label,
      reversed,
      geometry: {
        coords: reversed ? coords.slice().reverse() : coords,
        distanceM,
        ascentM: ascentM || undefined,
        overlapFrac: round(overlapFraction(coords), 3),
        uTurns: uTurns(coords),
      },
      departure: new Date(dep).toISOString(),
      evaluation,
      score: 0,
      track,
    };
  };

  const nombre = req.name?.trim() || "Mi ruta";
  const best = construir(
    mejor.reversed,
    mejor.dep,
    mejor.ev,
    mejor.reversed ? "importada-inv" : "importada",
    mejor.reversed ? `${nombre} (sentido inverso)` : nombre
  );

  const alternatives: Candidate[] = [];
  if (esBucle) {
    const otro = !mejor.reversed;
    const segs = otro ? segsRev : segsFwd;
    const ev = evaluar(segs, mejor.dep);
    alternatives.push(
      construir(
        otro,
        mejor.dep,
        ev,
        otro ? "importada-inv" : "importada",
        otro ? `${nombre} (sentido inverso)` : nombre
      )
    );
  }

  const segsBest = mejor.reversed ? segsRev : segsFwd;
  const hours: HourOption[] = departures.map((dep) => {
    const ev = evaluar(segsBest, dep);
    return {
      departure: new Date(dep).toISOString(),
      timeS: ev.timeS,
      windCostS: ev.windCostS,
      homeTailwind: ev.homeTailwind,
      meanHeadwind: ev.meanHeadwind,
      score: ev.timeS,
    };
  });

  const outlook: HourOption[] = [];
  const fin = Math.min(wind.end - 3600000, Date.now() + OUTLOOK_DAYS * 86400000);
  for (let t = Math.max(wind.start, nextHour(Date.now())); t <= fin; t += 3600000) {
    const h = new Date(t + tz).getUTCHours();
    if (h < 6 || h > 20) continue;
    const ev = evaluar(segsBest, t);
    outlook.push({
      departure: new Date(t).toISOString(),
      timeS: ev.timeS,
      windCostS: ev.windCostS,
      homeTailwind: ev.homeTailwind,
      meanHeadwind: ev.meanHeadwind,
      score: ev.timeS,
    });
  }

  const worst = { gust: 0, precipProb: 0, speed10: 0 };
  for (const p of best.track) {
    const s = wind.sample(p.lon, p.lat, mejor.dep + p.min * 60000);
    if (s.gust > worst.gust) worst.gust = s.gust;
    if (s.precipProb > worst.precipProb) worst.precipProb = s.precipProb;
    if (s.speed10 > worst.speed10) worst.speed10 = s.speed10;
  }

  const padLon = Math.max(0.02, (maxLon - minLon) * 0.18);
  const padLat = Math.max(0.02, (maxLat - minLat) * 0.18);
  const N = 7;
  const grid: PlanResponse["wind"]["grid"] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const lon = minLon - padLon + ((maxLon - minLon + 2 * padLon) * i) / (N - 1);
      const lat = minLat - padLat + ((maxLat - minLat + 2 * padLat) * j) / (N - 1);
      const s = wind.sample(lon, lat, mejor.dep);
      grid.push({ lon: round(lon, 4), lat: round(lat, 4), dir: round(s.fromDeg, 0), ms: round(s.speed10, 2) });
    }
  }

  return {
    best,
    alternatives,
    hours,
    outlook,
    wind: {
      atStart: wind.sample(coords[0][0], coords[0][1], mejor.dep),
      worst,
      grid,
      series: wind.seriesAt(coords[0][0], coords[0][1]),
    },
    meta: {
      provider: "ors",
      profile: "ruta importada",
      requestedKm: round(distanceM / 1000, 1),
      routingCalls: 0,
      warnings,
      rider,
    },
  };
}
