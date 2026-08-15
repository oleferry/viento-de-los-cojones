import type { RiderProfile, Segment, SegmentResult, RouteEvaluation } from "./types";
import { angleDiff, toRad } from "./geo";

export const DEFAULT_RIDER: RiderProfile = {
  powerW: 173,
  massKg: 85,
  cda: 0.32,
  crr: 0.0038,
  drivetrain: 0.975,
  rho: 1.2,
  draftMultiplier: 1,
  draftFraction: 0,
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
 * Densidad del aire humedo a partir de presion, temperatura y humedad relativa.
 * Importa mas de lo que parece: en Tierra de Campos, a 800 m y 32 grados, la
 * densidad baja a ~1,06 frente a 1,225 a nivel del mar en atmosfera estandar,
 * y el arrastre aerodinamico es proporcional a ella. Son mas de un 10% del
 * termino que domina en llano.
 */
export function airDensity(pressureHpa: number, tempC: number, humidityPct: number): number {
  const T = tempC + 273.15;
  if (!(pressureHpa > 300) || !(T > 150)) return 1.2;
  // Presion de vapor de saturacion (Tetens), en Pa.
  const pSat = 610.78 * 10 ** ((7.5 * tempC) / (tempC + 237.3));
  const pv = Math.max(0, Math.min(1, humidityPct / 100)) * pSat;
  const pd = pressureHpa * 100 - pv;
  const rho = pd / (287.058 * T) + pv / (461.495 * T);
  return rho > 0.5 && rho < 1.6 ? rho : 1.2;
}

/**
 * Potencia necesaria para rodar a `v` m/s con `headwind` m/s de viento
 * proyectado en contra (negativo si va a favor) y pendiente `grade`.
 */
export function powerFor(
  v: number,
  headwind: number,
  grade: number,
  r: RiderProfile,
  cda = r.cda,
  rho = r.rho
): number {
  const vAir = v + headwind; // velocidad del aire relativa al ciclista
  const fAero = 0.5 * rho * cda * Math.abs(vAir) * vAir; // conserva el signo
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
  r: RiderProfile,
  cda = r.cda,
  rho = r.rho
): number {
  let lo = 0.5; // 1.8 km/h: por debajo de esto se anda, no se pedalea
  // 70 km/h. Nadie sigue apretando por encima de eso: se deja de pedalear y se
  // baja a rueda libre. Sin este tope el modelo se inventa bajadas a 90 y una
  // ruta con desnivel salia mas rapida que la misma en llano.
  let hi = 19.4;
  if (powerFor(hi, headwind, grade, r, cda, rho) < powerW) return hi;
  if (powerFor(lo, headwind, grade, r, cda, rho) > powerW) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (powerFor(mid, headwind, grade, r, cda, rho) < powerW) lo = mid;
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

/**
 * CdA efectivo yendo en grupo. El rebufo no protege igual con el viento de
 * cara que de costado: en cuanto el aire aparente entra angulado, la rueda de
 * delante deja de taparte y el grupo se abre en abanico. Degradamos el
 * beneficio linealmente hasta quedarnos con la mitad a partir de 45 grados de
 * angulo aparente, que es cuando en la practica ya vas en el borde de la
 * cuneta buscando sitio.
 */
export function draftedCdA(
  cda: number,
  r: RiderProfile,
  apparentYawDeg: number
): number {
  const f = r.draftFraction ?? 0;
  const m = r.draftMultiplier ?? 1;
  if (f <= 0 || m >= 1) return cda;
  const shelter = 1 - 0.5 * Math.min(1, apparentYawDeg / 45);
  const sheltered = 1 - (1 - m) * shelter;
  return cda * (1 - f + f * sheltered);
}

/** Angulo del viento aparente respecto al eje de avance, en grados. */
function apparentYaw(v: number, headwind: number, crosswind: number): number {
  return Math.abs((Math.atan2(crosswind, v + headwind) * 180) / Math.PI);
}

/**
 * Velocidad resolviendo a la vez el rebufo, que depende del angulo aparente y
 * este de la propia velocidad. Dos iteraciones de punto fijo bastan: la
 * dependencia es suave y converge a centesimas de m/s.
 */
function speedWithDraft(
  r: RiderProfile,
  headwind: number,
  crosswind: number,
  grade: number,
  rho: number
): { v: number; cda: number } {
  let cda = draftedCdA(r.cda, r, apparentYaw(8, headwind, crosswind));
  let v = speedFor(r.powerW, headwind, grade, r, cda, rho);
  for (let i = 0; i < 2; i++) {
    cda = draftedCdA(r.cda, r, apparentYaw(v, headwind, crosswind));
    v = speedFor(r.powerW, headwind, grade, r, cda, rho);
  }
  return { v, cda };
}

/** Tiempo que costaria la ruta sin nada de viento. No depende de la hora. */
export function calmTime(segments: Segment[], rider: RiderProfile, rho = rider.rho): number {
  const cda = draftedCdA(rider.cda, rider, 0);
  let t = 0;
  for (const s of segments) {
    t += s.len / speedFor(rider.powerW, 0, s.grade, rider, cda, rho);
  }
  return t;
}

export interface WindAt {
  (lon: number, lat: number, tSec: number): {
    speed: number;
    fromDeg: number;
    rho?: number;
  };
}

/**
 * Simula la ruta segmento a segmento avanzando el reloj: el viento se consulta
 * en el instante en el que el ciclista pisa cada tramo, no en el de salida.
 * Esa es la diferencia entre "hoy hace sur" y una prevision util.
 */
export function evaluateRoute(
  segments: Segment[],
  windAt: WindAt,
  rider: RiderProfile,
  precomputedCalmS?: number
): RouteEvaluation {
  const results: SegmentResult[] = [];
  const total = segments.length
    ? segments[segments.length - 1].cum + segments[segments.length - 1].len
    : 0;
  let t = 0;
  let timeCalm = 0;
  let tailDist = 0;
  let headDist = 0;
  let homeNum = 0;
  let homeDen = 0;
  let outNum = 0;
  let outDen = 0;
  let headSum = 0;
  let rhoSum = 0;

  // Tramos "ida" y "vuelta" para los modos que miran donde cae el viento a favor.
  const HOME_FROM = 0.65;
  const OUT_TO = 0.35;

  for (const s of segments) {
    const w = windAt(s.lon, s.lat, t);
    const rho = w.rho ?? rider.rho;
    const eff = w.speed * WIND_HEIGHT_FACTOR;
    const { yaw, headwind, crosswind } = decomposeWind(s.bearing, eff, w.fromDeg);
    const { v, cda } = speedWithDraft(rider, headwind, crosswind, s.grade, rho);
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
    rhoSum += rho * s.len;
    if (precomputedCalmS == null) {
      timeCalm += s.len / speedFor(rider.powerW, 0, s.grade, rider, cda, rho);
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
    meanRho: total > 0 ? rhoSum / total : rider.rho,
    segments: results,
  };
}
