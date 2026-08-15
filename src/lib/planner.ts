import type {
  Candidate,
  HourOption,
  LonLat,
  PlanRequest,
  PlanResponse,
  RiderProfile,
  RouteEvaluation,
  RouteGeometry,
  Segment,
  TrackPoint,
} from "./types";
import {
  bbox,
  destination,
  haversine,
  polygonLoop,
  resample,
  samplingGrid,
  toSegments,
} from "./geo";
import { DEFAULT_RIDER, calmTime, evaluateRoute } from "./physics";
import { fetchElevations, fetchWindField } from "./wind";
import {
  pLimit,
  pickProvider,
  profileLabel,
  route,
  type Provider,
} from "./routing";

/** Los caminos no van en linea recta: el perimetro pedido al router se encoge. */
const DETOUR_FACTOR = 1.12;
const HEADING_STEP = 30;
const MAX_REFINEMENTS = 3;
/** Longitud de los tramos en los que troceamos la ruta para simularla. */
const SEGMENT_STEP_M = 400;

interface Shaped {
  id: string;
  headingDeg?: number;
  geometry: RouteGeometry;
  segmentsFwd: Segment[];
  segmentsRev: Segment[];
  label: string;
}

interface Scored {
  shape: Shaped;
  reversed: boolean;
  departureMs: number;
  evaluation: RouteEvaluation;
  score: number;
}

function reverseCoords(coords: number[][]): number[][] {
  return coords.slice().reverse();
}

function norm(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return 1;
  return hi - lo < 1e-9 ? 0 : (x - lo) / (hi - lo);
}

function nextHour(ms: number): number {
  return Math.ceil(ms / 3600000) * 3600000;
}

/** Numero de vertices del bucle: mas vertices = bucle mas redondo. */
function loopVertices(distanceKm: number): number {
  if (distanceKm <= 25) return 4;
  if (distanceKm <= 80) return 4;
  return 5;
}

export async function plan(
  req: PlanRequest,
  signal?: AbortSignal
): Promise<PlanResponse> {
  const warnings: string[] = [];
  const rider: RiderProfile = { ...DEFAULT_RIDER, ...(req.rider ?? {}) };
  const provider: Provider = pickProvider();
  const targetM = Math.max(5, Math.min(400, req.distanceKm)) * 1000;
  const flex = Math.max(0, Math.min(12, req.flexHours ?? 3));
  const baseMs = nextHour(req.departureMs ?? Date.now());

  if (provider === "osrm") {
    warnings.push(
      "Sin ORS_API_KEY: se usa el OSRM publico de FOSSGIS. Funciona, pero no distingue carretera/camino ni informa del firme."
    );
  }

  // --- 1. Campo de viento -------------------------------------------------
  const center: LonLat =
    req.shape === "lineal" && req.end
      ? [(req.start[0] + req.end[0]) / 2, (req.start[1] + req.end[1]) / 2]
      : req.start;
  const spanM =
    req.shape === "lineal" && req.end
      ? Math.max(4000, haversine(req.start, req.end) / 2)
      : Math.max(4000, targetM / (2 * Math.PI));

  const horizonDays = Math.ceil(
    (baseMs + (flex + 14) * 3600000 - Date.now()) / 86400000
  );
  const windPromise = fetchWindField(
    samplingGrid(center, spanM, 6),
    Math.max(2, Math.min(16, horizonDays + 1)),
    signal
  );

  // --- 2. Candidatos geometricos -----------------------------------------
  const limit = pLimit(provider === "ors" ? 5 : 3);
  let routingCalls = 0;
  const shapes: Shaped[] = [];

  const buildShape = (
    id: string,
    label: string,
    geometry: RouteGeometry,
    headingDeg?: number
  ): Shaped => {
    const fwd = resample(geometry.coords, SEGMENT_STEP_M);
    return {
      id,
      label,
      headingDeg,
      geometry,
      segmentsFwd: toSegments(fwd),
      segmentsRev: toSegments(reverseCoords(fwd)),
    };
  };

  if (req.shape === "lineal") {
    if (!req.end) throw new Error("Una ruta lineal necesita punto de llegada");
    routingCalls++;
    const geom = await limit(() => route([req.start, req.end!], req.surface, provider, signal));
    shapes.push(buildShape("directa", "Ruta directa", geom));

    // Variantes: forzamos un rodeo lateral para tener alternativas que el
    // viento pueda desempatar (a veces vale la pena desviarse 5 km).
    const mid: LonLat = [
      (req.start[0] + req.end[0]) / 2,
      (req.start[1] + req.end[1]) / 2,
    ];
    const direct = haversine(req.start, req.end);
    const offset = Math.min(12000, Math.max(2500, direct * 0.18));
    const perp = (bearingOf(req.start, req.end) + 90) % 360;
    const variants: { id: string; label: string; via: LonLat }[] = [
      { id: "norte", label: "Variante por un lado", via: destination(mid, perp, offset) },
      { id: "sur", label: "Variante por el otro lado", via: destination(mid, (perp + 180) % 360, offset) },
    ];
    const results = await Promise.allSettled(
      variants.map((v) => {
        routingCalls++;
        return limit(() => route([req.start, v.via, req.end!], req.surface, provider, signal));
      })
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.distanceM < direct * 2.2) {
        shapes.push(buildShape(variants[i].id, variants[i].label, r.value));
      }
    });
  } else {
    const n = loopVertices(req.distanceKm);
    const headings: number[] = [];
    for (let h = 0; h < 360; h += HEADING_STEP) headings.push(h);

    const settled = await Promise.allSettled(
      headings.map((h) => {
        routingCalls++;
        const wps = polygonLoop(req.start, h, targetM / DETOUR_FACTOR, n, true);
        return limit(() => route(wps, req.surface, provider, signal));
      })
    );

    settled.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const ratio = r.value.distanceM / targetM;
      if (ratio < 0.6 || ratio > 1.6) return; // el router se fue por los cerros
      shapes.push(
        buildShape(
          `h${headings[i]}`,
          `Salida hacia ${headings[i]}°`,
          r.value,
          headings[i]
        )
      );
    });

    if (!shapes.length) {
      const failures = settled.filter((s) => s.status === "rejected") as PromiseRejectedResult[];
      throw new Error(
        failures.length
          ? `No se pudo trazar ningun bucle: ${String(failures[0].reason).slice(0, 200)}`
          : "No se pudo trazar ningun bucle con esa distancia desde ese punto"
      );
    }
  }

  const wind = await windPromise;

  // --- 3. Evaluacion: geometria x sentido x hora de salida -----------------
  const departures: number[] = [];
  for (let d = -flex; d <= flex; d++) {
    const t = baseMs + d * 3600000;
    if (t >= wind.start && t <= wind.end - 3600000) departures.push(t);
  }
  if (!departures.length) departures.push(Math.max(wind.start, Math.min(baseMs, wind.end - 3600000)));

  const windAtMs = (lon: number, lat: number, epochMs: number) => {
    const s = wind.sample(lon, lat, epochMs);
    return { speed: s.speed10, fromDeg: s.fromDeg, rho: s.rho };
  };

  // Densidad de referencia para el tiempo "en calma": la del punto de salida a
  // la hora base. Solo sirve de vara de medir, no entra en la simulacion real.
  const refRho = wind.sample(req.start[0], req.start[1], baseMs).rho;

  // El tiempo "en calma" no depende de la hora: lo calculamos una vez por
  // geometria y sentido. Es la mitad del coste de la simulacion.
  const calmCache = new Map<string, number>();
  const calmFor = (key: string, segs: Segment[]) => {
    let v = calmCache.get(key);
    if (v == null) {
      v = calmTime(segs, rider, refRho);
      calmCache.set(key, v);
    }
    return v;
  };

  const evaluateAll = (list: Shaped[]): Scored[] => {
    const out: Scored[] = [];
    for (const shape of list) {
      const senses: { reversed: boolean; segs: Segment[] }[] =
        req.shape === "lineal"
          ? [{ reversed: false, segs: shape.segmentsFwd }]
          : [
              { reversed: false, segs: shape.segmentsFwd },
              { reversed: true, segs: shape.segmentsRev },
            ];
      for (const sense of senses) {
        const calm = calmFor(`${shape.id}:${sense.reversed}`, sense.segs);
        for (const dep of departures) {
          // El simulador avanza el reloj en segundos desde la salida; aqui lo
          // convertimos al instante absoluto para consultar la prevision.
          const at = (lon: number, lat: number, tSec: number) =>
            windAtMs(lon, lat, dep + tSec * 1000);
          const evaluation = evaluateRoute(sense.segs, at, rider, calm);
          out.push({
            shape,
            reversed: sense.reversed,
            departureMs: dep,
            evaluation,
            score: 0,
          });
        }
      }
    }
    return out;
  };

  const applyScores = (list: Scored[]) => {
    const times = list.map((s) => s.evaluation.timeS);
    const homes = list.map((s) => s.evaluation.homeTailwind);
    const outs = list.map((s) => s.evaluation.outboundTailwind);
    const tLo = Math.min(...times), tHi = Math.max(...times);
    const hLo = Math.min(...homes), hHi = Math.max(...homes);
    const oLo = Math.min(...outs), oHi = Math.max(...outs);

    for (const s of list) {
      const nt = norm(s.evaluation.timeS, tLo, tHi);
      const nh = norm(s.evaluation.homeTailwind, hLo, hHi);
      const no = norm(s.evaluation.outboundTailwind, oLo, oHi);
      switch (req.windMode) {
        case "min_effort":
          s.score = nt;
          break;
        case "hard_first":
          s.score = 0.25 * nt + 0.55 * (1 - nh) + 0.2 * no;
          break;
        default: // tailwind_home
          s.score = 0.35 * nt + 0.65 * (1 - nh);
      }
      // Penalizacion suave por desviarse de la distancia pedida (solo circulares).
      if (req.shape === "circular") {
        const dev = Math.abs(s.shape.geometry.distanceM - targetM) / targetM;
        s.score += Math.max(0, dev - 0.08) * 1.2;
      }
    }
    list.sort((a, b) => a.score - b.score);
  };

  let scored = evaluateAll(shapes);
  applyScores(scored);

  // --- 4. Refinado de distancia para los mejores bucles --------------------
  if (req.shape === "circular") {
    const seen = new Set<string>();
    const toFix: Scored[] = [];
    for (const s of scored) {
      if (seen.has(s.shape.id)) continue;
      seen.add(s.shape.id);
      const dev = Math.abs(s.shape.geometry.distanceM - targetM) / targetM;
      if (dev > 0.08) toFix.push(s);
      if (toFix.length >= MAX_REFINEMENTS) break;
    }
    if (toFix.length) {
      const n = loopVertices(req.distanceKm);
      const fixed = await Promise.allSettled(
        toFix.map((s) => {
          routingCalls++;
          const scale = targetM / s.shape.geometry.distanceM;
          const wps = polygonLoop(
            req.start,
            s.shape.headingDeg ?? 0,
            (targetM / DETOUR_FACTOR) * scale,
            n,
            true
          );
          return limit(() => route(wps, req.surface, provider, signal));
        })
      );
      fixed.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const old = toFix[i].shape;
        const better =
          Math.abs(r.value.distanceM - targetM) < Math.abs(old.geometry.distanceM - targetM);
        if (!better) return;
        const idx = shapes.findIndex((s) => s.id === old.id);
        if (idx >= 0) {
          shapes[idx] = buildShape(old.id, old.label, r.value, old.headingDeg);
        }
      });
      scored = evaluateAll(shapes);
      applyScores(scored);
    }
  }

  // --- 5. Altimetria para los finalistas (OSRM no la trae) -----------------
  if (provider === "osrm") {
    const finalists: Shaped[] = [];
    const seen = new Set<string>();
    for (const s of scored) {
      if (seen.has(s.shape.id)) continue;
      seen.add(s.shape.id);
      finalists.push(s.shape);
      if (finalists.length >= 4) break;
    }
    const enriched = await Promise.allSettled(
      finalists.map((s) => enrichElevation(s.geometry, signal))
    );
    let any = false;
    enriched.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return;
      any = true;
      const idx = shapes.findIndex((s) => s.id === finalists[i].id);
      if (idx >= 0) shapes[idx] = buildShape(finalists[i].id, finalists[i].label, r.value, finalists[i].headingDeg);
    });
    if (any) {
      scored = evaluateAll(shapes.filter((s) => finalists.some((f) => f.id === s.id)));
      applyScores(scored);
    } else {
      warnings.push("Sin datos de altimetria: los tiempos ignoran las cuestas.");
    }
  }

  // --- 6. Resultado --------------------------------------------------------
  const best = scored[0];
  const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

  const toCandidate = (s: Scored): Candidate => {
    const segs = s.reversed ? s.shape.segmentsRev : s.shape.segmentsFwd;
    const res = s.evaluation.segments ?? [];
    let elapsed = 0;
    const track: TrackPoint[] = segs.map((seg, i) => {
      const r = res[i];
      const point: TrackPoint = {
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
      return point;
    });
    // Cerramos con el punto final para que la polilinea pintada llegue al destino.
    const last = segs[segs.length - 1];
    if (last) {
      const end = destination(
        [last.lon, last.lat],
        last.bearing,
        last.len
      );
      const lastRes = res[res.length - 1];
      track.push({
        lon: round(end[0], 5),
        lat: round(end[1], 5),
        hw: round(lastRes?.headwind ?? 0, 2),
        yaw: round(lastRes?.yaw ?? 0, 0),
        kmh: round((lastRes?.speed ?? 0) * 3.6, 1),
        km: round((last.cum + last.len) / 1000, 2),
        min: round(elapsed / 60, 1),
        wd: round(lastRes?.windFromDeg ?? 0, 0),
        ws: round(lastRes?.windMs ?? 0, 2),
        brg: round(last.bearing, 0),
        ele: last.ele != null ? round(last.ele, 0) : undefined,
      });
    }

    const { segments: _drop, ...evaluation } = s.evaluation;
    return {
      id: `${s.shape.id}${s.reversed ? "-inv" : ""}`,
      label: s.reversed ? `${s.shape.label} (sentido inverso)` : s.shape.label,
      headingDeg: s.shape.headingDeg,
      reversed: s.reversed,
      geometry: s.reversed
        ? { ...s.shape.geometry, coords: reverseCoords(s.shape.geometry.coords) }
        : s.shape.geometry,
      departure: new Date(s.departureMs).toISOString(),
      evaluation,
      score: round(s.score, 4),
      track,
    };
  };

  const alternatives: Candidate[] = [];
  const usedShapes = new Set([best.shape.id]);
  for (const s of scored) {
    if (usedShapes.has(s.shape.id)) continue;
    usedShapes.add(s.shape.id);
    alternatives.push(toCandidate(s));
    if (alternatives.length >= 3) break;
  }

  const hours: HourOption[] = scored
    .filter((s) => s.shape.id === best.shape.id && s.reversed === best.reversed)
    .map((s) => ({
      departure: new Date(s.departureMs).toISOString(),
      timeS: s.evaluation.timeS,
      windCostS: s.evaluation.windCostS,
      homeTailwind: s.evaluation.homeTailwind,
      meanHeadwind: s.evaluation.meanHeadwind,
      score: s.score,
    }))
    .sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure));

  const bestCandidate = toCandidate(best);

  // Lo peor de la ruta: rachas y probabilidad de agua en el momento y punto
  // exactos por los que pasarias. Sirve para avisar antes de salir.
  const worst = { gust: 0, precipProb: 0, speed10: 0 };
  for (const p of bestCandidate.track) {
    const s = wind.sample(p.lon, p.lat, best.departureMs + p.min * 60000);
    if (s.gust > worst.gust) worst.gust = s.gust;
    if (s.precipProb > worst.precipProb) worst.precipProb = s.precipProb;
    if (s.speed10 > worst.speed10) worst.speed10 = s.speed10;
  }

  return {
    best: bestCandidate,
    alternatives,
    hours,
    wind: {
      atStart: wind.sample(req.start[0], req.start[1], best.departureMs),
      worst,
      series: wind.seriesAt(req.start[0], req.start[1]),
    },
    meta: {
      provider,
      profile: profileLabel(provider, req.surface),
      requestedKm: req.distanceKm,
      routingCalls,
      warnings,
      rider,
    },
  };
}

function bearingOf(a: LonLat, b: LonLat): number {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Anade altitud a una geometria que no la trae, muestreando hasta 100 puntos
 * equiespaciados e interpolando el resto.
 */
async function enrichElevation(
  geom: RouteGeometry,
  signal?: AbortSignal
): Promise<RouteGeometry | null> {
  const coords = geom.coords;
  if (!coords.length || coords[0].length > 2) return null;
  const N = Math.min(100, coords.length);
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    idx.push(Math.round((i * (coords.length - 1)) / (N - 1)));
  }
  const sampled = idx.map((i) => coords[i]);
  const eles = await fetchElevations(sampled, signal);
  if (!eles) return null;

  const out = coords.map((c) => [c[0], c[1], 0]);
  for (let k = 0; k < idx.length - 1; k++) {
    const a = idx[k];
    const b = idx[k + 1];
    const span = Math.max(1, b - a);
    for (let i = a; i <= b; i++) {
      out[i][2] = eles[k] + ((eles[k + 1] - eles[k]) * (i - a)) / span;
    }
  }
  out[out.length - 1][2] = eles[eles.length - 1];

  let ascent = 0;
  for (let i = 1; i < out.length; i++) {
    const d = out[i][2] - out[i - 1][2];
    if (d > 0) ascent += d;
  }
  return { ...geom, coords: out, ascentM: ascent };
}

export { bbox };
