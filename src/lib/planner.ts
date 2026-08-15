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
  overlapFraction,
  polygonLoop,
  resample,
  samplingGrid,
  toSegments,
  uTurns,
} from "./geo";
import { DEFAULT_RIDER, calmTime, evaluateRoute } from "./physics";
import { fetchElevations, fetchWindField } from "./wind";
import {
  pLimit,
  profileLabel,
  providerChain,
  route,
  type Provider,
} from "./routing";

/** Los caminos no van en linea recta: el perimetro pedido al router se encoge. */
const DETOUR_FACTOR = 1.12;
const HEADING_STEP = 30;
const MAX_REFINEMENTS = 3;
/** Longitud de los tramos en los que troceamos la ruta para simularla. */
const SEGMENT_STEP_M = 400;
/**
 * Dias que se muestran en el pronostico a varios dias. Mas de cinco es
 * enganarse: la prevision de viento a esa distancia ya no distingue una tarde
 * de otra.
 */
const OUTLOOK_DAYS = 5;

/**
 * Tope de ruta repetida que se tolera. Por encima de esto la ruta deja de ser
 * un recorrido y se convierte en un ir y volver por el mismo sitio, que es
 * justo lo que nadie quiere.
 */
const MAX_OVERLAP = 0.12;
/** Distancia maxima que admite el generador de bucles de ORS. */
const ROUND_TRIP_MAX_M = 100_000;

interface Shaped {
  id: string;
  /**
   * Clave unica de ESTA version de la geometria. El id se conserva cuando una
   * ruta se vuelve a trazar (al ajustar la distancia o al anadirle altimetria),
   * asi que cachear por id devolvia tiempos calculados sobre la geometria vieja.
   */
  key: string;
  headingDeg?: number;
  geometry: RouteGeometry;
  segmentsFwd: Segment[];
  segmentsRev: Segment[];
  label: string;
  /** Fraccion de la ruta que se pisa dos veces. */
  overlap: number;
  /** Cuantas veces la ruta se da la vuelta en mitad del recorrido. */
  vueltas: number;
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
  const chain: Provider[] = providerChain();
  // Cual se ha usado de verdad: la cadena conmuta sola si el primero falla.
  let usedProvider: Provider = chain[0];
  const targetM = Math.max(5, Math.min(400, req.distanceKm)) * 1000;
  const flex = Math.max(0, Math.min(12, req.flexHours ?? 3));
  const baseMs = nextHour(req.departureMs ?? Date.now());

  if (!process.env.ORS_API_KEY) {
    warnings.push(
      "Sin clave de OpenRouteService: se enruta con servidores públicos gratuitos. Funciona bien, pero no informa del reparto de firme y puede saturarse en horas punta."
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

  // Horas de prevision necesarias: cubrir el margen pedido, la duracion de la
  // ruta y los OUTLOOK_DAYS dias del pronostico a varios dias. Mas alla de eso
  // la prevision de viento ya no vale para planificar nada.
  const horizonHours =
    Math.ceil((baseMs - Date.now()) / 3600000) + flex + 14 + OUTLOOK_DAYS * 24;
  const windPromise = fetchWindField(
    samplingGrid(center, spanM, 6),
    Math.max(30, Math.min(240, horizonHours)),
    signal
  );

  /**
   * Con bici de carretera el asfalto no es una preferencia, es un requisito:
   * una cubierta de 25 en un camino de tierra es un pinchazo y una vuelta
   * andando. Al reves no aplica igual, porque una gravel rueda perfectamente
   * por asfalto, asi que "camino" es preferencia y "carretera" es obligacion.
   */
  const avoidUnpaved = req.surface === "carretera";
  /**
   * Tierra tolerada con bici de carretera: practicamente nada. El margen es
   * solo para no descartar una ruta por veinte metros de acceso a un pueblo.
   *
   * Se mide sobre el firme CONFIRMADO como tierra, no sobre "lo que no consta
   * como asfalto": en OpenStreetMap muchisimas comarcales espanolas no llevan
   * etiqueta de firme, y contarlas como camino hacia que una ruta enteramente
   * asfaltada apareciese al 89%.
   */
  const MAX_UNPAVED = 0.005;

  // --- 2. Candidatos geometricos -----------------------------------------
  // ORS gratuito limita por minuto ademas de por dia. Con 3 en vuelo las
  // peticiones se reparten en el tiempo y un par de planes seguidos no
  // disparan el limite.
  const limit = pLimit(3);
  let routingCalls = 0;
  const shapes: Shaped[] = [];

  let shapeVersion = 0;
  const buildShape = (
    id: string,
    label: string,
    geometry: RouteGeometry,
    headingDeg?: number
  ): Shaped => {
    const fwd = resample(geometry.coords, SEGMENT_STEP_M);
    return {
      id,
      key: `${id}#${shapeVersion++}`,
      label,
      headingDeg,
      geometry,
      segmentsFwd: toSegments(fwd),
      segmentsRev: toSegments(reverseCoords(fwd)),
      overlap: overlapFraction(geometry.coords),
      vueltas: uTurns(geometry.coords),
    };
  };

  /** Rumbo con el que arranca de verdad la ruta ya trazada. */
  const initialHeading = (coords: number[][]): number | undefined => {
    if (coords.length < 2) return undefined;
    // A 1,5 km del inicio: el primer punto suele ser una calle del pueblo y no
    // dice nada de hacia donde va la ruta.
    let acc = 0;
    for (let i = 1; i < coords.length; i++) {
      acc += haversine(
        [coords[i - 1][0], coords[i - 1][1]],
        [coords[i][0], coords[i][1]]
      );
      if (acc >= 1500) {
        return Math.round(
          bearingOf([coords[0][0], coords[0][1]], [coords[i][0], coords[i][1]])
        );
      }
    }
    return undefined;
  };

  if (req.shape === "lineal") {
    if (!req.end) throw new Error("Una ruta lineal necesita punto de llegada");
    routingCalls++;
    const geom = await limit(() => route([req.start, req.end!], req.surface, chain, signal));
    usedProvider = geom.provider;
    if (geom.fallbacks?.length) warnings.push(...geom.fallbacks);
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
        return limit(() => route([req.start, v.via, req.end!], req.surface, chain, signal));
      })
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.distanceM < direct * 2.2) {
        shapes.push(buildShape(variants[i].id, variants[i].label, r.value));
      }
    });
  } else {
    const n = loopVertices(req.distanceKm);
    const allHeadings: number[] = [];
    for (let h = 0; h < 360; h += HEADING_STEP) allHeadings.push(h);

    // Precribado sin gastar peticiones: el bucle ideal (el poligono, antes de
    // pegarlo a las carreteras) ya dice bastante sobre como le va a sentar el
    // viento. Puntuamos los 12 rumbos sobre esa geometria teorica y solo
    // enrutamos los que valen la pena. Pasamos de 12 peticiones a 7, que en el
    // OSRM publico es la diferencia entre funcionar y comerse un 502.
    const wind = await windPromise;
    // Con ORS repartimos el presupuesto de peticiones entre los dos
    // generadores: menos rumbos, pero a cambio bucles trazados sobre la red
    // real. Sin ORS todo va al barrido, que es lo unico disponible.
    const usaRoundTrip = chain[0] === "ors" && targetM <= ROUND_TRIP_MAX_M;
    const headings = preselectHeadings(
      allHeadings,
      req,
      targetM,
      n,
      wind,
      baseMs,
      rider,
      usaRoundTrip ? 4 : 7
    );

    type Job = { id: string; heading?: number; run: () => Promise<Awaited<ReturnType<typeof route>>> };
    const jobs: Job[] = headings.map((h) => ({
      id: `h${h}`,
      heading: h,
      run: () => {
        const wps = polygonLoop(req.start, h, targetM / DETOUR_FACTOR, n, true);
        return route(wps, req.surface, chain, signal);
      },
    }));

    // Bucles generados por el propio router. Nuestro poligono controla el rumbo
    // de salida, que es la palanca del viento, pero sus vertices caen donde
    // caen y provocan idas y vueltas. ORS traza el bucle siguiendo la red de
    // carreteras, asi que sale mucho mas limpio. Se usan los dos y que decida
    // la puntuacion.
    if (usaRoundTrip) {
      for (let s = 0; s < 4; s++) {
        jobs.push({
          id: `rt${s}`,
          run: () =>
            route(
              [req.start],
              req.surface,
              ["ors"],
              signal,
              {
                roundTrip: { lengthM: targetM, points: 4 + (s % 3), seed: s * 7 + 1 },
              }
            ),
        });
      }
    }

    const settled = await Promise.allSettled(
      jobs.map((j) => {
        routingCalls++;
        return limit(j.run);
      })
    );

    settled.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      usedProvider = r.value.provider;
      for (const f of r.value.fallbacks ?? []) {
        if (!warnings.includes(f)) warnings.push(f);
      }
      const ratio = r.value.distanceM / targetM;
      if (ratio < 0.6 || ratio > 1.6) return; // el router se fue por los cerros
      const job = jobs[i];
      const heading = job.heading ?? initialHeading(r.value.coords);
      shapes.push(
        buildShape(
          job.id,
          heading != null
            ? `Salida hacia ${cardinalOf(heading)} (${heading}°)`
            : "Bucle",
          r.value,
          heading
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

    // Los filtros van en este orden a proposito. Primero la distancia: no
    // sirve de nada una ruta impecable de 57 km cuando se han pedido 40.
    const cerca = shapes.filter(
      (s) => Math.abs(s.geometry.distanceM - targetM) / targetM <= 0.25
    );
    if (cerca.length >= 2) {
      shapes.length = 0;
      shapes.push(...cerca);
    }

    // Despues, fuera las que se dan la vuelta en mitad del campo. Esto va
    // ANTES que el solape total, porque un solo pico de ida y vuelta arruina
    // la salida aunque en porcentaje del total apenas se note.
    const sinVueltas = shapes.filter((s) => s.vueltas === 0);
    if (sinVueltas.length >= 2) {
      shapes.length = 0;
      shapes.push(...sinVueltas);
    }

    // Y fuera las que se pisan a si mismas.
    const limpias = shapes.filter((s) => s.overlap <= MAX_OVERLAP);
    if (limpias.length >= 2) {
      shapes.length = 0;
      shapes.push(...limpias);
    }

    // Por ultimo el firme.
    if (avoidUnpaved) {
      const conDato = shapes.filter((s) => s.geometry.unpavedFrac != null);
      if (conDato.length) {
        // Cero tierra. Nada de "casi todo asfalto": con cubierta de 25 un solo
        // kilometro de camino ya te ha fastidiado la salida.
        const asfaltadas = conDato.filter(
          (s) => (s.geometry.unpavedFrac ?? 0) <= MAX_UNPAVED
        );
        if (asfaltadas.length) {
          shapes.length = 0;
          shapes.push(...asfaltadas);
        } else {
          const mejor = Math.min(...conDato.map((s) => s.geometry.unpavedFrac ?? 1));
          const cerca = conDato.filter(
            (s) => (s.geometry.unpavedFrac ?? 1) <= mejor + 0.01
          );
          shapes.length = 0;
          shapes.push(...cerca);
          warnings.push(
            `Desde ahí no sale ningún bucle de esa distancia sin pisar algo de camino: el mejor lleva un ${(mejor * 100).toFixed(1)}% sin asfaltar.`
          );
        }
      }
    } else if (req.surface === "camino") {
      // Al reves: si se ha pedido montana, que de verdad haya camino. Es
      // preferencia y no obligacion, porque una gravel rueda por asfalto.
      const conDato = shapes.filter((s) => s.geometry.unpavedFrac != null);
      if (conDato.length >= 2) {
        const mejor = Math.max(...conDato.map((s) => s.geometry.unpavedFrac ?? 0));
        if (mejor > 0.1) {
          const conTierra = conDato.filter(
            (s) => (s.geometry.unpavedFrac ?? 0) >= mejor * 0.6
          );
          if (conTierra.length) {
            shapes.length = 0;
            shapes.push(...conTierra);
          }
        }
      }
    }
  }

  const wind = await windPromise;
  if (!shapes.length) {
    throw new Error("No se pudo trazar ninguna ruta con esos parametros");
  }

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

  // El tiempo "en calma" de referencia, con una densidad del aire fija. Sirve
  // para ORDENAR candidatos (todos con la misma vara de medir) y se cachea
  // porque no depende de la hora. Para lo que se le ENSENA al usuario se
  // recalcula sin cache, con la densidad real de cada instante: si no, una
  // tarde de aire ligero salia "mas rapida que en calma" y el peaje del viento
  // se iba a negativo sin que hubiera nada raro en el viento.
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
        const calm = calmFor(`${shape.key}:${sense.reversed}`, sense.segs);
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
      // Y una dura por repetir camino: entre dos rutas parecidas, siempre la
      // que no te hace desandar lo andado. El peso es alto a proposito, para
      // que gane a una diferencia moderada de viento.
      s.score += s.shape.overlap * 2.5;
      // Un giro de 180 en mitad del campo se penaliza como lo que es: motivo
      // de descarte. Solo llega aqui si no habia alternativa sin ellos.
      s.score += s.shape.vueltas * 1.5;
      // Con bici de carretera, cada metro de tierra pesa.
      if (avoidUnpaved) {
        s.score += (s.shape.geometry.unpavedFrac ?? 0) * 8;
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
          return limit(() => route(wps, req.surface, chain, signal));
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

  // --- 5. Altimetria para los finalistas ----------------------------------
  // ORS y BRouter ya la traen en la propia geometria; OSRM no, y sin ella los
  // tiempos ignorarian las cuestas. Se pide aparte solo en ese caso.
  if (usedProvider === "osrm") {
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
    // Reevaluacion honesta para los numeros que se publican: sin el calma
    // cacheado, para que el peaje del viento compare contra la misma densidad
    // del aire que sufre la ruta.
    const evaluation0 = evaluateRoute(
      segs,
      (lon, lat, tSec) => windAtMs(lon, lat, s.departureMs + tSec * 1000),
      rider
    );
    const res = evaluation0.segments ?? [];
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

    const { segments: _drop, ...evaluation } = evaluation0;
    return {
      id: `${s.shape.id}${s.reversed ? "-inv" : ""}`,
      label: s.reversed ? `${s.shape.label} (sentido inverso)` : s.shape.label,
      headingDeg: s.shape.headingDeg,
      reversed: s.reversed,
      geometry: {
        ...s.shape.geometry,
        overlapFrac: round(s.shape.overlap, 3),
        uTurns: s.shape.vueltas,
        ...(s.reversed ? { coords: reverseCoords(s.shape.geometry.coords) } : {}),
      },
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

  // --- Previsión a varios días para la ruta ganadora ----------------------
  // Solo se recalcula la simulacion, que es CPU pura: ni una peticion mas.
  const bestSegs = best.reversed ? best.shape.segmentsRev : best.shape.segmentsFwd;
  const bestCalm = calmFor(`${best.shape.key}:${best.reversed}`, bestSegs);
  const tz = (req.tzOffsetMinutes ?? 0) * 60000;
  const outlook: HourOption[] = [];
  const outlookEnd = Math.min(wind.end - 3600000, Date.now() + OUTLOOK_DAYS * 86400000);
  for (let t = Math.max(wind.start, nextHour(Date.now())); t <= outlookEnd; t += 3600000) {
    const localHour = new Date(t + tz).getUTCHours();
    if (localHour < 6 || localHour > 20) continue; // de noche no se sale
    const ev = evaluateRoute(
      bestSegs,
      (lon, lat, tSec) => windAtMs(lon, lat, t + tSec * 1000)
    , rider);
    outlook.push({
      departure: new Date(t).toISOString(),
      timeS: ev.timeS,
      windCostS: ev.windCostS,
      homeTailwind: ev.homeTailwind,
      meanHeadwind: ev.meanHeadwind,
      score:
        req.windMode === "min_effort"
          ? ev.timeS
          : ev.timeS - ev.homeTailwind * 900 +
            (req.windMode === "hard_first" ? ev.outboundTailwind * 300 : 0),
    });
  }

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

  // Rejilla de viento sobre la caja de la ruta, con un margen para que las
  // flechas lleguen hasta los bordes del mapa. Sale gratis: el campo ya esta
  // descargado y se interpola.
  const [minLon, minLat, maxLon, maxLat] = bbox(bestCandidate.geometry.coords);
  const padLon = Math.max(0.02, (maxLon - minLon) * 0.18);
  const padLat = Math.max(0.02, (maxLat - minLat) * 0.18);
  const N = 7;
  const grid: PlanResponse["wind"]["grid"] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const lon = minLon - padLon + ((maxLon - minLon + 2 * padLon) * i) / (N - 1);
      const lat = minLat - padLat + ((maxLat - minLat + 2 * padLat) * j) / (N - 1);
      const s = wind.sample(lon, lat, best.departureMs);
      grid.push({
        lon: round(lon, 4),
        lat: round(lat, 4),
        dir: round(s.fromDeg, 0),
        ms: round(s.speed10, 2),
      });
    }
  }

  return {
    best: bestCandidate,
    alternatives,
    hours,
    outlook,
    wind: {
      atStart: wind.sample(req.start[0], req.start[1], best.departureMs),
      worst,
      grid,
      series: wind.seriesAt(req.start[0], req.start[1]),
    },
    meta: {
      provider: usedProvider,
      profile: profileLabel(usedProvider, req.surface),
      requestedKm: req.distanceKm,
      routingCalls,
      warnings,
      rider,
    },
  };
}

const CARDINALS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];
function cardinalOf(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Elige que rumbos de salida merece la pena enrutar.
 *
 * Enrutar cuesta una peticion de red por candidato; evaluar el poligono teorico
 * no cuesta nada. Como el viento depende del RUMBO y el rumbo del poligono ya
 * se parece bastante al de la carretera que lo sigue, el precribado acierta casi
 * siempre y ahorra la mitad de las peticiones.
 *
 * Se garantiza variedad: ademas de los mejores por puntuacion se cuela siempre
 * alguno que salga hacia el lado opuesto, para no ofrecer cuatro rutas iguales.
 */
function preselectHeadings(
  headings: number[],
  req: PlanRequest,
  targetM: number,
  n: number,
  wind: { sample: (lon: number, lat: number, t: number) => { speed10: number; fromDeg: number; rho: number } },
  departureMs: number,
  rider: RiderProfile,
  keep: number
): number[] {
  if (headings.length <= keep) return headings;

  const scored = headings.map((h) => {
    const pts = polygonLoop(req.start, h, targetM / DETOUR_FACTOR, n, true);
    const coords = pts.map((p) => [p[0], p[1]]);
    const segs = toSegments(resample(coords, SEGMENT_STEP_M));
    let best = Infinity;
    for (const reversed of [false, true]) {
      const s = reversed ? toSegments(resample(coords.slice().reverse(), SEGMENT_STEP_M)) : segs;
      const ev = evaluateRoute(
        s,
        (lon, lat, tSec) => {
          const w = wind.sample(lon, lat, departureMs + tSec * 1000);
          return { speed: w.speed10, fromDeg: w.fromDeg, rho: w.rho };
        },
        rider
      );
      // Mismo criterio que el ranking final, en version reducida.
      const score =
        req.windMode === "min_effort"
          ? ev.timeS
          : ev.timeS - ev.homeTailwind * 900 + (req.windMode === "hard_first" ? ev.outboundTailwind * 300 : 0);
      if (score < best) best = score;
    }
    return { h, score: best };
  });

  const byScore = [...scored].sort((a, b) => a.score - b.score);
  const picked: number[] = [];
  const take = (h: number) => {
    if (!picked.includes(h)) picked.push(h);
  };

  // Dos tercios por puntuacion pura...
  const strong = Math.max(1, Math.ceil((keep * 2) / 3));
  for (const s of byScore.slice(0, strong)) take(s.h);

  // ...y el resto buscando rumbos alejados de lo ya elegido, para dar opciones
  // que no sean variaciones de la misma.
  while (picked.length < keep) {
    let bestH = -1;
    let bestGap = -1;
    for (const s of byScore) {
      if (picked.includes(s.h)) continue;
      const gap = Math.min(
        ...picked.map((p) => Math.abs(((s.h - p + 540) % 360) - 180))
      );
      if (gap > bestGap) {
        bestGap = gap;
        bestH = s.h;
      }
    }
    if (bestH < 0) break;
    take(bestH);
  }

  return picked.sort((a, b) => a - b);
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
