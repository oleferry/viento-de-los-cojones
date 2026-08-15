import type { RiderProfile, Segment, SegmentResult, RouteEvaluation } from "./types";
import { angleDiff, toRad } from "./geo";

export const DEFAULT_RIDER: RiderProfile = {
  powerW: 165,
  massKg: 82,
  cda: 0.32,
  crr: 0.005,
  drivetrain: 0.975,
  rho: 1.2,
};

const G = 9.80665;

/**
 * El viento a 10 m (lo que dan los modelos) no es el que sufre el ciclista, que
 * va a ~1.2-1.5 m sobre un terreno con rugosidad. Ley logaritmica con z0 = 0.05 m
 * (campo abierto de cultivo, que es justo Tierra de Campos):
 *   v(z) = v10 * ln(z/z0) / ln(10/z0)
 * -> a 1.3 m sale un factor ~0.61. Redondeamos a 0.65 por ser conservadores en
 * los tramos expuestos, que es donde de verdad duele.
 */
export const WIND_HEIGHT_FACTOR = 0.65;

/**
 * Potencia necesaria para rodar a `v` m/s con `headwind` m/s de viento
 * proyectado en contra (negativo si va a favor) y pendiente `grade`.
 */
export function powerFor(
  v: number,
  headwind: number,
  grade: number,
  r: RiderProfile
): number {
  const vAir = v + headwind; // velocidad del aire relativa al ciclista
  const fAero = 0.5 * r.rho * r.cda * Math.abs(vAir) * vAir; // conserva el signo
  const theta = Math.atan(grade);
  const fRoll = r.crr * r.massKg * G * Math.cos(theta);
  const fGrav = r.massKg * G * Math.sin(theta);
  return ((fAero + fRoll + fGrav) * v) / r.drivetrain;
}

/**
 * Invierte `powerFor` por biseccion: velocidad de equilibrio para una potencia
 * dada. La funcion es monotona creciente en v dentro del rango util, asi que la
 * biseccion es estable y sin sorpresas (Newton se va de madre con viento fuerte
 * a favor, donde la derivada cambia de signo).
 */
export function speedFor(
  powerW: number,
  headwind: number,
  grade: number,
  r: RiderProfile
): number {
  let lo = 0.5; // 1.8 km/h: por debajo de esto se anda, no se pedalea
  let hi = 25; // 90 km/h
  if (powerFor(hi, headwind, grade, r) < powerW) return hi;
  if (powerFor(lo, headwind, grade, r) > powerW) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (powerFor(mid, headwind, grade, r) < powerW) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Descompone el viento sobre un segmento.
 * `fromDeg` es la direccion meteorologica (de donde VIENE). El vector de avance
 * del viento apunta a fromDeg + 180. Si el ciclista va en rumbo `brng`:
 *   yaw = |fromDeg - brng|  -> 0 significa viento de cara pura.
 *   headwind = speed * cos(yaw)   (positivo = en contra)
 *   crosswind = speed * |sin(yaw)|
 */
export function decomposeWind(brng: number, speed: number, fromDeg: number) {
  const yawSigned = angleDiff(brng, fromDeg);
  const yaw = Math.abs(yawSigned);
  const rad = toRad(yaw);
  return {
    yaw,
    headwind: speed * Math.cos(rad),
    crosswind: Math.abs(speed * Math.sin(rad)),
  };
}

export interface WindAt {
  (lon: number, lat: number, tSec: number): { speed: number; fromDeg: number };
}

/**
 * Simula la ruta segmento a segmento avanzando el reloj: el viento se consulta
 * en el instante en el que el ciclista pisa cada tramo, no en el de salida.
 * Esa es la diferencia entre "hoy hace sur" y una prevision util.
 */
/** Tiempo que costaria la ruta sin nada de viento. No depende de la hora. */
export function calmTime(segments: Segment[], rider: RiderProfile): number {
  let t = 0;
  for (const s of segments) t += s.len / speedFor(rider.powerW, 0, s.grade, rider);
  return t;
}

export function evaluateRoute(
  segments: Segment[],
  windAt: WindAt,
  rider: RiderProfile,
  precomputedCalmS?: number
): RouteEvaluation {
  const results: SegmentResult[] = [];
  const total = segments.length ? segments[segments.length - 1].cum + segments[segments.length - 1].len : 0;
  let t = 0;
  let timeCalm = 0;
  let tailDist = 0;
  let headDist = 0;
  let homeNum = 0;
  let homeDen = 0;
  let outNum = 0;
  let outDen = 0;
  let headSum = 0;

  // Tramos "ida" y "vuelta" para los modos que miran donde cae el viento a favor.
  const HOME_FROM = 0.65;
  const OUT_TO = 0.35;

  for (const s of segments) {
    const w = windAt(s.lon, s.lat, t);
    const eff = w.speed * WIND_HEIGHT_FACTOR;
    const { yaw, headwind, crosswind } = decomposeWind(s.bearing, eff, w.fromDeg);
    const v = speedFor(rider.powerW, headwind, s.grade, rider);
    const dt = s.len / v;
    results.push({
      headwind,
      crosswind,
      speed: v,
      time: dt,
      yaw,
      windFromDeg: w.fromDeg,
      windMs: eff,
    });
    t += dt;
    if (precomputedCalmS == null) {
      timeCalm += s.len / speedFor(rider.powerW, 0, s.grade, rider);
    }

    if (yaw > 120) tailDist += s.len;
    if (yaw < 60) headDist += s.len;
    headSum += headwind * s.len;

    const frac = total > 0 ? s.cum / total : 0;
    if (frac >= HOME_FROM) {
      homeNum += -headwind * s.len;
      homeDen += s.len;
    }
    if (frac <= OUT_TO) {
      outNum += -headwind * s.len;
      outDen += s.len;
    }
  }

  const timeS = t;
  const calm = precomputedCalmS ?? timeCalm;
  return {
    timeS,
    timeCalmS: calm,
    windCostS: timeS - calm,
    tailwindFrac: total > 0 ? tailDist / total : 0,
    headwindFrac: total > 0 ? headDist / total : 0,
    homeTailwind: homeDen > 0 ? homeNum / homeDen : 0,
    outboundTailwind: outDen > 0 ? outNum / outDen : 0,
    meanHeadwind: total > 0 ? headSum / total : 0,
    avgKmh: timeS > 0 ? (total / timeS) * 3.6 : 0,
    segments: results,
  };
}
