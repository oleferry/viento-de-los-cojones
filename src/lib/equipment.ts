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

export interface CatalogItem {
  id: string;
  label: string;
  /** Aportacion al CdA total, en m^2. */
  cda: number;
  note?: string;
}

/* ---------------------------------------------------------------- posturas */

export interface Position {
  id: string;
  label: string;
  /** Coeficiente que multiplica la superficie corporal para dar el CdA del cuerpo. */
  k: number;
  note: string;
}

export const POSITIONS: Position[] = [
  { id: "tops", label: "Manos arriba", k: 0.1609, note: "erguido, paseo o subiendo" },
  { id: "hoods", label: "En las manetas", k: 0.1297, note: "la postura normal de ruta" },
  { id: "drops", label: "Manillar bajo", k: 0.1142, note: "agachado, tirando" },
  { id: "aero", label: "Acoples / crono", k: 0.0882, note: "posicion de contrarreloj" },
];

/* ----------------------------------------------------------------- cuadros */

export const FRAMES: CatalogItem[] = [
  { id: "tt", label: "Cabra / contrarreloj", cda: 0.03, note: "cuadro de crono" },
  { id: "aero-top", label: "Aero de gama alta", cda: 0.035, note: "Cervélo S5, Canyon Aeroad CFR, Giant Propel, Scott Foil RC, Pinarello Dogma F, Ridley Noah Fast, Bianchi Oltre" },
  { id: "aero-allround", label: "All-round moderno", cda: 0.042, note: "Tarmac SL8, Trek Madone/Émonda, Factor Ostro VAM, BMC Teammachine R, Cervélo Soloist, Orbea Orca Aero, SuperSix Evo" },
  { id: "classic", label: "Carretera clásica", cda: 0.052, note: "tubos redondos, cables por fuera, acero o alu" },
  { id: "endurance", label: "Endurance / gran fondo", cda: 0.05, note: "Roubaix, Domane, Defy, Synapse" },
  { id: "gravel", label: "Gravel", cda: 0.058, note: "manillar flare y cubiertas anchas" },
  { id: "mtb", label: "MTB", cda: 0.075, note: "manillar recto y ruedas de tacos" },
  { id: "city", label: "Urbana / híbrida", cda: 0.07, note: "postura erguida, guardabarros" },
];

/* ------------------------------------------------------------------ ruedas */

export const WHEELS: CatalogItem[] = [
  { id: "disc", label: "Lenticular + 60 mm", cda: 0.007, note: "solo para crono" },
  { id: "d80", label: "80 mm y más", cda: 0.009, note: "Zipp 858/808, Princeton Blur 633" },
  { id: "d60", label: "58-65 mm", cda: 0.011, note: "Zipp 404, Enve SES 6.7, Roval Rapide CLX II, DT Swiss ARC 1100 62, Dura-Ace C60, Bora WTO 60, Hunt 54/58" },
  { id: "d45", label: "45-55 mm", cda: 0.013, note: "Enve SES 4.5, DT Swiss ARC 1100 50, Dura-Ace C50, Bora WTO 45, Vision Metron 45, Mavic Cosmic SL 45" },
  { id: "d35", label: "32-42 mm", cda: 0.016, note: "Zipp 303 Firecrest, Enve SES 3.4, Roval Alpinist CLX, Dura-Ace C36" },
  { id: "d25", label: "Caja baja de carbono", cda: 0.019, note: "perfil bajo, para montaña" },
  { id: "alu", label: "Aluminio de caja baja", cda: 0.022, note: "Mavic Ksyrium, Shimano RS, ruedas de serie" },
  { id: "gravel", label: "Gravel 40 mm", cda: 0.02, note: "llanta ancha con cubierta de 40-45 mm" },
  { id: "mtb", label: "MTB 29\"", cda: 0.03, note: "tacos" },
];

/* -------------------------------------------------------- ropa y accesorios */

export const CLOTHING: CatalogItem[] = [
  { id: "skinsuit", label: "Mono aero", cda: -0.015 },
  { id: "tight", label: "Maillot ajustado", cda: 0 },
  { id: "loose", label: "Maillot holgado", cda: 0.02 },
  { id: "jacket", label: "Chaqueta o cortavientos", cda: 0.035 },
];

export const HELMETS: CatalogItem[] = [
  { id: "tt", label: "Casco de crono", cda: -0.015 },
  { id: "aero", label: "Casco aero", cda: -0.008 },
  { id: "road", label: "Casco normal", cda: 0 },
  { id: "none", label: "Sin casco", cda: 0.005 },
];

export const LUGGAGE: CatalogItem[] = [
  { id: "none", label: "Nada", cda: 0 },
  { id: "small", label: "Bolsa de sillín", cda: 0.004 },
  { id: "bikepacking", label: "Bikepacking", cda: 0.022 },
  { id: "panniers", label: "Alforjas", cda: 0.045 },
];

/* -------------------------------------------------------------- neumaticos */

export interface TyreItem {
  id: string;
  label: string;
  /** Coeficiente de rodadura sobre asfalto en buen estado. */
  crr: number;
  note?: string;
}

/**
 * Crr por PAREJA de neumaticos sobre asfalto liso, en el orden de magnitud que
 * publican los bancos de rodillos (GP5000 S TR ~0,0025 por cubierta a presion
 * alta). Se aplica luego un factor por el firme real de la ruta.
 */
export const TYRES: TyreItem[] = [
  { id: "race-tl", label: "Competición tubeless 25-28", crr: 0.0038, note: "GP5000 S TR, Corsa Pro TLR, Turbo Cotton" },
  { id: "race", label: "Carretera rápida 25-28", crr: 0.0045, note: "GP5000 con cámara, Corsa N.EXT" },
  { id: "training", label: "Entreno / antipinchazos", crr: 0.006, note: "GP4-Season, Gatorskin, Marathon" },
  { id: "gravel-fast", label: "Gravel liso 35-40", crr: 0.0075, note: "Pathfinder, Terra Speed" },
  { id: "gravel-knob", label: "Gravel tacos 40-45", crr: 0.0105, note: "Terra Trail, Riddler" },
  { id: "mtb", label: "MTB", crr: 0.014 },
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
  groupSize: 1,
  draftFraction: 0,
};

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
 */
export function intensitySanity(intensity: number, hours: number): string | null {
  const ceiling =
    hours <= 1 ? 1.0 : hours <= 2 ? 0.88 : hours <= 3 ? 0.83 : hours <= 5 ? 0.78 : 0.72;
  if (intensity > ceiling + 0.04) {
    return `Un IF de ${intensity.toFixed(2)} durante ${hours.toFixed(1)} h es de récord. Para esa duración lo sostenible ronda ${ceiling.toFixed(2)}.`;
  }
  return null;
}
