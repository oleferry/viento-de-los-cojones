export type LonLat = [number, number]; // [lon, lat] (orden GeoJSON)

export type Surface = "carretera" | "camino" | "mixto";
export type Shape = "circular" | "lineal";
/**
 * tailwind_home: prioriza volver con el aire a favor (aunque cueste mas ir).
 * min_effort:    minimiza el esfuerzo/tiempo total contra el aire.
 * hard_first:    el palo primero — viento en contra en la ida, a favor a la vuelta
 *                (parecido a tailwind_home pero penalizando ademas el viento a
 *                favor en la ida, para no "gastar" el regalo demasiado pronto).
 */
export type WindMode = "tailwind_home" | "min_effort" | "hard_first";

export interface PlanRequest {
  start: LonLat;
  /** Solo para rutas lineales. */
  end?: LonLat;
  shape: Shape;
  /** Distancia objetivo en km (circular) o distancia maxima aceptada (lineal). */
  distanceKm: number;
  surface: Surface;
  windMode: WindMode;
  /** Instante de salida en epoch ms. Si falta, la proxima hora en punto. */
  departureMs?: number;
  /** Cuantas horas alrededor de `departureMs` se exploran para sugerir mejor hora. */
  flexHours?: number;
  /** Desfase horario del usuario en minutos (para saber que es "de dia"). */
  tzOffsetMinutes?: number;
  rider?: Partial<RiderProfile>;
}

export interface RiderProfile {
  /** Potencia sostenible en vatios. */
  powerW: number;
  /** Masa total (ciclista + bici + bidones) en kg. */
  massKg: number;
  /** Area frontal x coeficiente de arrastre (m^2). */
  cda: number;
  /** Coeficiente de rodadura. */
  crr: number;
  /** Rendimiento de la transmision (0-1). */
  drivetrain: number;
  /** Densidad del aire de reserva, si no se puede calcular de la prevision. */
  rho: number;
  /** Multiplicador de CdA yendo a rueda (0,62 = ahorras el 38%). */
  draftMultiplier?: number;
  /** Fraccion del tiempo que vas resguardado (0-1). */
  draftFraction?: number;
}

export interface WindSample {
  /** Velocidad del viento a 10 m, m/s. */
  speed10: number;
  /** Direccion METEOROLOGICA: de donde VIENE el viento, en grados desde el norte. */
  fromDeg: number;
  /** Racha a 10 m, m/s. */
  gust: number;
  tempC: number;
  precipProb: number;
  /** Densidad del aire calculada con presion, temperatura y humedad (kg/m^3). */
  rho: number;
  /** Presion en superficie (hPa). */
  pressure: number;
  /** Humedad relativa (%). */
  humidity: number;
}

export interface Segment {
  /** Punto inicial del segmento. */
  lon: number;
  lat: number;
  /** Longitud en metros. */
  len: number;
  /** Rumbo de avance en grados desde el norte. */
  bearing: number;
  /** Pendiente (adimensional, dz/dx). */
  grade: number;
  /** Distancia acumulada al inicio del segmento (m). */
  cum: number;
  /** Altitud del punto inicial (m), si la geometria la trae. */
  ele?: number;
}

export interface SegmentResult {
  /** Componente de viento en contra proyectada sobre el rumbo (m/s, negativo = a favor). */
  headwind: number;
  /** Componente lateral (m/s, valor absoluto). */
  crosswind: number;
  /** Velocidad resultante (m/s). */
  speed: number;
  /** Tiempo empleado (s). */
  time: number;
  /** Angulo entre el rumbo y el viento (0 = en contra frontal, 180 = a favor). */
  yaw: number;
  /** Direccion meteorologica del viento en ese punto e instante (grados). */
  windFromDeg: number;
  /** Velocidad del viento efectiva a la altura del ciclista (m/s). */
  windMs: number;
}

export interface RouteEvaluation {
  /** Tiempo total estimado en segundos. */
  timeS: number;
  /** Tiempo que costaria la misma ruta sin nada de viento (s). */
  timeCalmS: number;
  /** Sobrecoste del viento en segundos (puede ser negativo si domina el viento a favor). */
  windCostS: number;
  /** Fraccion de la distancia con viento a favor (yaw > 120 deg). */
  tailwindFrac: number;
  /** Fraccion de la distancia con viento en contra (yaw < 60 deg). */
  headwindFrac: number;
  /** Media ponderada del componente de viento a favor en el ultimo tramo (m/s). */
  homeTailwind: number;
  /** Media ponderada del componente de viento a favor en el primer tramo (m/s). */
  outboundTailwind: number;
  /** Viento medio proyectado en contra a lo largo de la ruta (m/s). */
  meanHeadwind: number;
  /** Velocidad media estimada (km/h). */
  avgKmh: number;
  /** Densidad del aire media a lo largo de la ruta (kg/m^3). */
  meanRho: number;
  /** Detalle por segmento. Se omite en la respuesta HTTP (va en `track`). */
  segments?: SegmentResult[];
}

/** Punto de la ruta ya simulado, listo para pintar y para la tabla de paso. */
export interface TrackPoint {
  lon: number;
  lat: number;
  /** Viento proyectado en contra (m/s, negativo = a favor). */
  hw: number;
  /** Angulo respecto al viento: 0 = de cara, 180 = de culo. */
  yaw: number;
  /** Velocidad estimada en ese tramo (km/h). */
  kmh: number;
  /** Distancia acumulada (km). */
  km: number;
  /** Minutos desde la salida. */
  min: number;
  /** Direccion de donde viene el viento (grados). */
  wd: number;
  /** Velocidad del viento efectiva (m/s). */
  ws: number;
  /** Rumbo de avance del ciclista (grados). */
  brg: number;
  /** Altitud del terreno (m), si se conoce. */
  ele?: number;
}

export interface RouteGeometry {
  /** [lon, lat] o [lon, lat, ele]. */
  coords: number[][];
  distanceM: number;
  ascentM?: number;
  /** Reparto de firme en metros por categoria, si el proveedor lo aporta. */
  surfaceBreakdown?: Record<string, number>;
  pavedFrac?: number;
  /** Fraccion de la ruta que se pisa dos veces (ida y vuelta por lo mismo). */
  overlapFrac?: number;
}

export interface Candidate {
  id: string;
  label: string;
  /** Rumbo inicial de salida en grados (solo circulares). */
  headingDeg?: number;
  /** Sentido de recorrido aplicado a la geometria base. */
  reversed: boolean;
  geometry: RouteGeometry;
  /** Hora de salida elegida (ISO local). */
  departure: string;
  evaluation: RouteEvaluation;
  score: number;
  /** Serie simulada a lo largo de la ruta (un punto cada ~400 m). */
  track: TrackPoint[];
}

export interface HourOption {
  departure: string;
  timeS: number;
  windCostS: number;
  homeTailwind: number;
  meanHeadwind: number;
  score: number;
}

export interface PlanResponse {
  best: Candidate;
  alternatives: Candidate[];
  /** Ranking de horas de salida para la ruta ganadora, dentro del margen pedido. */
  hours: HourOption[];
  /**
   * La misma ruta ganadora evaluada en todas las horas de luz de los proximos
   * dias. No cuesta ni una peticion mas de routing y responde a la pregunta
   * util de verdad: "¿que dia me conviene hacer esto?".
   */
  outlook: HourOption[];
  wind: {
    /** Viento en el punto de salida a la hora elegida. */
    atStart: WindSample;
    /** Lo peor que te vas a encontrar a lo largo de la ruta elegida. */
    worst: { gust: number; precipProb: number; speed10: number };
    /** Serie horaria en el punto de salida. */
    series: { time: string; speed10: number; fromDeg: number; gust: number }[];
  };
  meta: {
    provider: "ors" | "brouter" | "osrm";
    profile: string;
    requestedKm: number;
    routingCalls: number;
    warnings: string[];
    rider: RiderProfile;
  };
}
