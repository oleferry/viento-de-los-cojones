/**
 * Catalogo de material y estimacion de CdA.
 *
 * Los tuneles de viento publican sus resultados en unidades incompatibles entre
 * si (gramos de arrastre a 45 km/h, vatios a 40 km/h, CdA solo de la rueda en
 * su propio utillaje), asi que aqui no se copian numeros de una tabla: se
 * construye un modelo coherente y se ANCLA cada familia de material en el rango
 * que reportan esas pruebas. Es decir, las diferencias relativas entre grupos
 * son fieles a la literatura; el valor absoluto de un modelo concreto es una
 * estimacion, no una medida.
 *
 * Anclajes usados:
 *  - CdA total medido de ciclistas entrenados: 0,26-0,32 en el manillar bajo y
 *    0,30-0,36 en las manetas (varias campanas de tunel publicadas).
 *  - Diferencia entre cuadro aero y cuadro de tubo redondo: ~0,015-0,020 m^2,
 *    consistente con las comparativas de superbikes (unos 8-12 W a 45 km/h).
 *  - Ruedas: entre una caja baja de aluminio y un perfil de 60 mm hay del
 *    orden de 10-15 W a 45 km/h, ~0,010-0,013 m^2.
 *  - Area frontal desde antropometria: superficie corporal de Du Bois
 *    (0,007184 * altura^0,725 * masa^0,425) escalada por la postura.
 */

/**
 * Los catalogos llevan SOLO fisica: el `id` es la clave con la que se busca el
 * nombre y la nota en los ficheros de traduccion (namespace `Equipment`). Aqui
 * no se escribe texto de interfaz en ningun idioma.
 */
export interface CatalogItem {
  id: string;
  /** Aportacion al CdA total, en m^2. */
  cda: number;
}

/* ---------------------------------------------------------------- posturas */

export interface Position {
  id: string;
  /** Coeficiente que multiplica la superficie corporal para dar el CdA del cuerpo. */
  k: number;
}

export const POSITIONS: Position[] = [
  { id: "tops", k: 0.1609 },
  { id: "hoods", k: 0.1297 },
  { id: "drops", k: 0.1142 },
  { id: "aero", k: 0.0882 },
];

/* ----------------------------------------------------------------- cuadros */

export const FRAMES: CatalogItem[] = [
  { id: "tt", cda: 0.03 },
  { id: "aero-top", cda: 0.035 },
  { id: "aero-allround", cda: 0.042 },
  { id: "classic", cda: 0.052 },
  { id: "endurance", cda: 0.05 },
  { id: "gravel", cda: 0.058 },
  { id: "mtb", cda: 0.075 },
  { id: "city", cda: 0.07 },
];

/* ------------------------------------------------------------------ ruedas */

export const WHEELS: CatalogItem[] = [
  { id: "disc", cda: 0.007 },
  { id: "d80", cda: 0.009 },
  { id: "d60", cda: 0.011 },
  { id: "d45", cda: 0.013 },
  { id: "d35", cda: 0.016 },
  { id: "d25", cda: 0.019 },
  { id: "alu", cda: 0.022 },
  { id: "gravel", cda: 0.02 },
  { id: "mtb", cda: 0.03 },
];

/* -------------------------------------------------------- ropa y accesorios */

export const CLOTHING: CatalogItem[] = [
  { id: "skinsuit", cda: -0.015 },
  { id: "tight", cda: 0 },
  { id: "loose", cda: 0.02 },
  { id: "jacket", cda: 0.035 },
];

export const HELMETS: CatalogItem[] = [
  { id: "tt", cda: -0.015 },
  { id: "aero", cda: -0.008 },
  { id: "road", cda: 0 },
  { id: "none", cda: 0.005 },
];

export const LUGGAGE: CatalogItem[] = [
  { id: "none", cda: 0 },
  { id: "small", cda: 0.004 },
  { id: "bikepacking", cda: 0.022 },
  { id: "panniers", cda: 0.045 },
];

/* -------------------------------------------------------------- neumaticos */

export interface TyreItem {
  id: string;
  /** Coeficiente de rodadura sobre asfalto en buen estado. */
  crr: number;
}

/**
 * Crr por PAREJA de neumaticos sobre asfalto liso, en el orden de magnitud que
 * publican los bancos de rodillos (GP5000 S TR ~0,0025 por cubierta a presion
 * alta). Se aplica luego un factor por el firme real de la ruta.
 */
export const TYRES: TyreItem[] = [
  { id: "race-tl", crr: 0.0038 },
  { id: "race", crr: 0.0045 },
  { id: "training", crr: 0.006 },
  { id: "gravel-fast", crr: 0.0075 },
  { id: "gravel-knob", crr: 0.0105 },
  { id: "mtb", crr: 0.014 },
];

/** Multiplicador de Crr segun el firme predominante de la ruta. */
export const SURFACE_CRR_FACTOR: Record<string, number> = {
  carretera: 1,
  mixto: 1.35,
  camino: 1.9,
};

/* ------------------------------------------------------------ antropometria */

/** Superficie corporal de Du Bois (m^2). Altura en cm, masa en kg. */
export function bodySurfaceArea(heightCm: number, massKg: number): number {
  return 0.007184 * heightCm ** 0.725 * massKg ** 0.425;
}

export interface RiderSetup {
  heightCm: number;
  /** Peso del ciclista, sin bici. */
  massKg: number;
  bikeKg: number;
  /** Bidones, herramientas, lo que lleves encima. */
  extraKg: number;
  position: string;
  frame: string;
  wheels: string;
  clothing: string;
  helmet: string;
  luggage: string;
  tyres: string;
  ftpW: number;
  /** Factor de intensidad: fraccion del FTP que piensas sostener. */
  intensity: number;
}

/**
 * Con quien sales HOY. Deliberadamente fuera del perfil: la bici y las piernas
 * son tuyas siempre, pero el grupo cambia de una salida a otra.
 */
export interface GroupSetup {
  /** Cuantos vais, tu incluido. 1 = solo. */
  groupSize: number;
  /** Fraccion del tiempo que vas resguardado (0-1). */
  draftFraction: number;
}

export const DEFAULT_SETUP: RiderSetup = {
  heightCm: 178,
  massKg: 75,
  bikeKg: 8.5,
  extraKg: 1.5,
  position: "hoods",
  frame: "aero-allround",
  wheels: "d45",
  clothing: "tight",
  helmet: "road",
  luggage: "small",
  tyres: "race-tl",
  ftpW: 240,
  intensity: 0.72,
};

export const DEFAULT_GROUP: GroupSetup = { groupSize: 1, draftFraction: 0 };

const find = <T extends { id: string }>(list: T[], id: string, fallback: T): T =>
  list.find((x) => x.id === id) ?? fallback;

export interface CdABreakdown {
  body: number;
  frame: number;
  wheels: number;
  clothing: number;
  helmet: number;
  luggage: number;
  total: number;
  bsa: number;
}

export function computeCdA(s: RiderSetup): CdABreakdown {
  const bsa = bodySurfaceArea(s.heightCm, s.massKg);
  const pos = find(POSITIONS, s.position, POSITIONS[1]);
  const body = pos.k * bsa;
  const frame = find(FRAMES, s.frame, FRAMES[2]).cda;
  const wheels = find(WHEELS, s.wheels, WHEELS[3]).cda;
  const clothing = find(CLOTHING, s.clothing, CLOTHING[1]).cda;
  const helmet = find(HELMETS, s.helmet, HELMETS[2]).cda;
  const luggage = find(LUGGAGE, s.luggage, LUGGAGE[0]).cda;
  const total = Math.max(0.12, body + frame + wheels + clothing + helmet + luggage);
  return { body, frame, wheels, clothing, helmet, luggage, total, bsa };
}

export function computeCrr(s: RiderSetup, surface: string): number {
  const base = find(TYRES, s.tyres, TYRES[0]).crr;
  return base * (SURFACE_CRR_FACTOR[surface] ?? 1);
}

export function totalMass(s: RiderSetup): number {
  return s.massKg + s.bikeKg + s.extraKg;
}

export function targetPower(s: RiderSetup): number {
  return Math.round(s.ftpW * s.intensity);
}

/* -------------------------------------------------------------- rebufo */

/**
 * Reduccion del arrastre yendo a rueda, segun el tamano del grupo. Son
 * multiplicadores del CdA (0,71 = ahorras el 29%).
 *
 * Anclajes: Broker et al. midieron ~29% para el segundo hombre de una
 * persecucion por equipos de cuatro y unos 7 puntos mas para el tercero;
 * Blocken et al. dan 27-35% a rueda segun separacion y postura, y por encima
 * del 50% en el interior de un peloton.
 */
export function draftMultiplier(groupSize: number): number {
  const n = Math.max(1, Math.round(groupSize));
  if (n <= 1) return 1;
  if (n === 2) return 0.71;
  if (n === 3) return 0.66;
  if (n === 4) return 0.62;
  if (n <= 6) return 0.58;
  if (n <= 10) return 0.54;
  if (n <= 20) return 0.48;
  return 0.4;
}

/** Reparto de relevos por defecto: en un grupo de n vas tapado (n-1)/n del tiempo. */
export function defaultDraftFraction(groupSize: number): number {
  const n = Math.max(1, Math.round(groupSize));
  return n <= 1 ? 0 : (n - 1) / n;
}

/**
 * Guia de Coggan sobre que factor de intensidad aguanta cada duracion. Sirve
 * para avisar cuando alguien pone un IF que no va a sostener tres horas.
 * Devuelve las cifras; el texto lo pone quien lo pinta, en su idioma.
 */
export function intensitySanity(
  intensity: number,
  hours: number
): { intensity: string; hours: string; ceiling: string } | null {
  const ceiling =
    hours <= 1 ? 1.0 : hours <= 2 ? 0.88 : hours <= 3 ? 0.83 : hours <= 5 ? 0.78 : 0.72;
  if (intensity > ceiling + 0.04) {
    return {
      intensity: intensity.toFixed(2),
      hours: hours.toFixed(1),
      ceiling: ceiling.toFixed(2),
    };
  }
  return null;
}
