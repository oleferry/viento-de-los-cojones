const CARDINALS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];

/** Rumbo en grados -> punto cardinal en castellano (O de Oeste). */
export function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
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

export function fmtHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Etiqueta corta para el tipo de viento que toca en un tramo. */
export function windLabel(yaw: number): string {
  if (yaw < 45) return "de cara";
  if (yaw < 80) return "casi de cara";
  if (yaw < 100) return "de lado";
  if (yaw < 135) return "casi a favor";
  return "a favor";
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

/** Escala de Beaufort abreviada, útil para saber si hoy toca sufrir. */
export function beaufort(ms: number): { n: number; name: string } {
  const table: [number, string][] = [
    [0.5, "calma"],
    [1.5, "ventolina"],
    [3.3, "flojito"],
    [5.5, "flojo"],
    [7.9, "bonancible"],
    [10.7, "fresquito"],
    [13.8, "fresco"],
    [17.1, "frescachón"],
    [20.7, "temporal"],
    [24.4, "temporal fuerte"],
  ];
  for (let i = 0; i < table.length; i++) {
    if (ms < table[i][0]) return { n: i, name: table[i][1] };
  }
  return { n: 10, name: "temporal duro" };
}
