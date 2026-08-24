import { toSetup, type NotifyCandidate } from "./account";
import { computeCdA, computeCrr, targetPower, totalMass } from "./equipment";
import { bbox, haversine, resample, samplingGrid, toSegments } from "./geo";
import { DEFAULT_RIDER } from "./physics";
import { computeOutlook } from "./planner";
import type { RiderProfile, WindMode } from "./types";
import { fetchWindField } from "./wind";

const SEGMENT_STEP_M = 400;
const HORIZON_HOURS = 48;
// El aviso es de "hoy toca buen viento": solo mira lo que queda de hoy y
// manana, no los 5 dias enteros del pronostico.
const LOOKAHEAD_MS = 36 * 3600000;
// Umbral doble para que el aviso valga la pena: al menos 5 minutos Y al menos
// un 8% del tiempo en calma, asi una ruta corta no dispara por 40 segundos y
// una muy larga no lo hace por un 1% que nadie nota.
const MIN_SAVE_S = 300;
const MIN_SAVE_FRAC = 0.08;

export interface WindWindow {
  departure: string;
  windCostS: number;
  timeS: number;
}

/**
 * Desfase horario de Madrid ahora mismo (util para la ventana "de dia" del
 * pronostico). La app es de momento solo para Espana, asi que no hace falta
 * guardar el huso de cada persona.
 */
function madridOffsetMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  const m = /GMT([+-]\d+)/.exec(parts.find((p) => p.type === "timeZoneName")?.value ?? "");
  return m ? Number(m[1]) * 60 : 60;
}

/**
 * Busca la mejor ventana de viento a favor en lo que queda de hoy y manana
 * para una ruta guardada. Devuelve null si no hay ninguna que merezca un
 * correo.
 */
export async function findWindWindow(c: NotifyCandidate): Promise<WindWindow | null> {
  if (c.coords.length < 2) return null;

  const setup = toSetup(c.profile, c.bike);
  const rider: RiderProfile = {
    ...DEFAULT_RIDER,
    powerW: targetPower(setup),
    massKg: totalMass(setup),
    cda: computeCdA(setup).total,
    crr: computeCrr(setup, c.surface),
    drivetrain: 0.975,
  };

  const [minLon, minLat, maxLon, maxLat] = bbox(c.coords);
  const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const spanM = Math.max(4000, haversine([minLon, minLat], [maxLon, maxLat]) / 2);
  const wind = await fetchWindField(samplingGrid(center, spanM, 6), HORIZON_HOURS);
  const segs = toSegments(resample(c.coords, SEGMENT_STEP_M));
  const outlook = computeOutlook(
    segs,
    wind,
    rider,
    c.windMode as WindMode,
    madridOffsetMinutes()
  );

  const cutoff = Date.now() + LOOKAHEAD_MS;
  let best: (typeof outlook)[number] | null = null;
  for (const h of outlook) {
    if (new Date(h.departure).getTime() > cutoff) break;
    if (!best || h.windCostS < best.windCostS) best = h;
  }
  if (!best) return null;

  const calmS = best.timeS - best.windCostS;
  const saveFrac = calmS > 0 ? -best.windCostS / calmS : 0;
  if (best.windCostS <= -MIN_SAVE_S && saveFrac >= MIN_SAVE_FRAC) {
    return { departure: best.departure, windCostS: best.windCostS, timeS: best.timeS };
  }
  return null;
}
