/**
 * Formato de cifras y rumbos.
 *
 * Todo lo que depende del idioma entra por parametro o sale como CLAVE para
 * que lo traduzca quien pinta: aqui no se escribe texto suelto en ningun
 * idioma. La unica excepcion son los puntos cardinales, que son una tabla
 * cerrada de dos entradas y no merecen un fichero de traduccion.
 */

// El oeste es "O" de Oeste en castellano y "W" de West en ingles; el resto de
// letras coinciden por casualidad.
const CARDINALS: Record<string, string[]> = {
  es: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"],
  en: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
};

export function cardinal(deg: number, locale = "es"): string {
  const table = CARDINALS[locale] ?? CARDINALS.es;
  return table[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function kmh(ms: number): number {
  return ms * 3.6;
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function fmtDelta(seconds: number): string {
  const sign = seconds >= 0 ? "+" : "−";
  const m = Math.round(Math.abs(seconds) / 60);
  return `${sign}${m} min`;
}

const bcp47 = (locale: string) => (locale === "en" ? "en-GB" : "es-ES");

export function fmtHour(iso: string, locale = "es"): string {
  return new Date(iso).toLocaleTimeString(bcp47(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(iso: string, locale = "es"): string {
  return new Date(iso).toLocaleDateString(bcp47(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export type WindLabelKey = "head" | "nearHead" | "cross" | "nearTail" | "tail";

/** Que tipo de viento toca en un tramo, como clave a traducir. */
export function windLabelKey(yaw: number): WindLabelKey {
  if (yaw < 45) return "head";
  if (yaw < 80) return "nearHead";
  if (yaw < 100) return "cross";
  if (yaw < 135) return "nearTail";
  return "tail";
}

/**
 * Color de un tramo segun el viento proyectado: rojo cuando pega de cara,
 * verde cuando empuja. Escala saturada a ±6 m/s (≈22 km/h), que es donde
 * la diferencia deja de notarse mas.
 */
export function windColor(headwindMs: number): string {
  const t = Math.max(-1, Math.min(1, headwindMs / 6));
  if (t >= 0) {
    // 0 -> ambar neutro, 1 -> rojo
    return mix([250, 204, 21], [239, 68, 68], t);
  }
  return mix([250, 204, 21], [52, 211, 153], -t);
}

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Escala de Beaufort abreviada: devuelve el grado y la clave del nombre. */
export function beaufort(ms: number): { n: number; key: string } {
  const limits = [0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4];
  for (let i = 0; i < limits.length; i++) {
    if (ms < limits[i]) return { n: i, key: `bf${i}` };
  }
  return { n: 10, key: "bf10" };
}
