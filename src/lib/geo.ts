import type { LonLat, Segment } from "./types";

export const R_EARTH = 6371008.8; // radio medio, m
export const toRad = (d: number) => (d * Math.PI) / 180;
export const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distancia en metros entre dos puntos [lon, lat]. */
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de a hacia b, grados desde el norte [0, 360). */
export function bearing(a: LonLat, b: LonLat): number {
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto a `dist` metros de `origin` siguiendo el rumbo `brng` (grados). */
export function destination(origin: LonLat, brng: number, dist: number): LonLat {
  const d = dist / R_EARTH;
  const b = toRad(brng);
  const la1 = toRad(origin[1]);
  const lo1 = toRad(origin[0]);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2)
    );
  return [((toDeg(lo2) + 540) % 360) - 180, toDeg(la2)];
}

/** Diferencia angular con signo entre dos rumbos, en (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = ((b - a + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

export function polylineLength(coords: number[][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(
      [coords[i - 1][0], coords[i - 1][1]],
      [coords[i][0], coords[i][1]]
    );
  }
  return total;
}

/**
 * Remuestrea una polilinea a segmentos de longitud ~`step` metros.
 * Conserva la altitud (3er componente) si existe, para poder calcular pendiente.
 */
export function resample(coords: number[][], step = 400): number[][] {
  if (coords.length < 2) return coords.slice();
  const out: number[][] = [coords[0].slice()];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = haversine([a[0], a[1]], [b[0], b[1]]);
    if (segLen === 0) continue;
    let pos = step - carry;
    while (pos < segLen) {
      const t = pos / segLen;
      const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (a.length > 2 && b.length > 2) pt.push(a[2] + (b[2] - a[2]) * t);
      out.push(pt);
      pos += step;
    }
    carry = (segLen - (pos - step)) % step;
    if (carry < 0) carry = 0;
  }
  const last = coords[coords.length - 1];
  if (haversine([out[out.length - 1][0], out[out.length - 1][1]], [last[0], last[1]]) > 1) {
    out.push(last.slice());
  }
  return out;
}

/** Convierte una polilinea remuestreada en segmentos con rumbo, longitud y pendiente. */
export function toSegments(coords: number[][]): Segment[] {
  const segs: Segment[] = [];
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = haversine([a[0], a[1]], [b[0], b[1]]);
    if (len < 1) continue;
    const dz = a.length > 2 && b.length > 2 ? b[2] - a[2] : 0;
    // Limitamos la pendiente a +-20% para que un error del DEM no dispare el modelo.
    const grade = Math.max(-0.2, Math.min(0.2, dz / len));
    segs.push({
      lon: a[0],
      lat: a[1],
      len,
      bearing: bearing([a[0], a[1]], [b[0], b[1]]),
      grade,
      cum,
      ele: a.length > 2 ? a[2] : undefined,
    });
    cum += len;
  }
  return segs;
}

/** Caja envolvente [minLon, minLat, maxLon, maxLat]. */
export function bbox(coords: number[][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const c of coords) {
    if (c[0] < minLon) minLon = c[0];
    if (c[0] > maxLon) maxLon = c[0];
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Vertices de un poligono regular "caminado": arrancamos en `start` con rumbo
 * `heading` y giramos 360/n grados en cada vertice. Al cabo de n pasos volvemos
 * (aproximadamente) al origen, lo que nos da un bucle cerrado del perimetro
 * pedido y con un rumbo de salida controlado. Es la pieza que permite decidir
 * "por donde salgo" en funcion del viento.
 */
export function polygonLoop(
  start: LonLat,
  heading: number,
  perimeterM: number,
  n = 5,
  clockwise = true
): LonLat[] {
  const side = perimeterM / n;
  const turn = (clockwise ? 1 : -1) * (360 / n);
  const pts: LonLat[] = [start];
  let cur = start;
  let brng = heading;
  for (let i = 0; i < n - 1; i++) {
    cur = destination(cur, brng, side);
    pts.push(cur);
    brng = (brng + turn + 360) % 360;
  }
  pts.push(start);
  return pts;
}

/** Puntos de muestreo para el viento: el centro mas un anillo de `n` puntos. */
export function samplingGrid(center: LonLat, radiusM: number, n = 6): LonLat[] {
  const pts: LonLat[] = [center];
  for (let i = 0; i < n; i++) {
    pts.push(destination(center, (360 / n) * i, radiusM));
  }
  return pts;
}
