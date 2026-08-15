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

/**
 * Fraccion de la ruta que se pisa dos veces, en cualquier sentido.
 *
 * Es la metrica que separa un recorrido de un ir-y-volver: a nadie le gusta
 * salir a un cruce, dar la vuelta de 180 y desandar lo andado. Pasa cuando el
 * vertice de un bucle cae en mitad del campo y el router tiene que ir a
 * tocarlo y volver.
 *
 * Se resuelve troceando en celdas de `cellM` metros y contando la distancia
 * cuyo tramo cae en una celda ya visitada. Comparar segmentos dos a dos seria
 * O(n^2); esto es lineal y, con celdas del tamano de un tramo, igual de fiable.
 *
 * La celda es pequena (50 m) a proposito: con celdas grandes un desvio corto de
 * ida y vuelta cae entero en una sola celda y no se cuenta como repetido.
 */
export function overlapFraction(coords: number[][], cellM = 50): number {
  if (coords.length < 3) return 0;
  const seen = new Set<string>();
  let repeated = 0;
  let total = 0;
  // Grados por metro: la longitud se estrecha con el coseno de la latitud.
  const latDeg = cellM / 111_320;
  const lat0 = coords[0][1];
  const lonDeg = cellM / (111_320 * Math.max(0.2, Math.cos(toRad(lat0))));

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = haversine([a[0], a[1]], [b[0], b[1]]);
    if (len === 0) continue;
    total += len;
    const midLon = (a[0] + b[0]) / 2;
    const midLat = (a[1] + b[1]) / 2;
    const key = `${Math.round(midLon / lonDeg)},${Math.round(midLat / latDeg)}`;
    if (seen.has(key)) repeated += len;
    else seen.add(key);
  }
  return total > 0 ? repeated / total : 0;
}

/**
 * Cuenta los cambios de sentido: puntos donde la ruta se da la vuelta y
 * desanda lo andado.
 *
 * La fraccion total de ruta repetida no los detecta. Un pico de un kilometro
 * en una ruta de 78 son un 2,5%, pasa cualquier filtro razonable, y sin embargo
 * es exactamente lo que arruina la salida: llegas a un sitio, frenas, giras 180
 * en mitad del campo y te vuelves por donde has venido.
 *
 * Se compara el rumbo de entrada con el de salida promediados sobre `ventanaM`
 * metros a cada lado, para no confundir un giro de verdad con la curva cerrada
 * de una carretera. Se ignoran los primeros y ultimos metros, porque en un
 * bucle salir y volver al mismo portal es justo lo que se pide.
 */
export function uTurns(coords: number[][]): number {
  const PASO_M = 25;
  const pts = resample(coords, PASO_M);
  if (pts.length < 8) return 0;

  const total = polylineLength(pts);
  // Distancia acumulada hasta cada punto, para localizar los giros.
  const acum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    acum.push(
      acum[i - 1] +
        haversine([pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]])
    );
  }

  /*
   * Varias escalas a la vez. Con una sola ventana se escapan la mitad de los
   * desvios: uno de 150 m es invisible para una ventana de 220 porque el rumbo
   * promediado se lo come, y uno de 600 m no se ve con una ventana de 80
   * porque dentro de ella la carretera parece recta. Se buscan en las tres y
   * se juntan los que caigan en el mismo sitio.
   */
  const encontrados: number[] = [];
  for (const ventanaM of [80, 180, 350]) {
    const paso = Math.max(2, Math.round(ventanaM / PASO_M));
    for (let i = paso; i < pts.length - paso; i++) {
      const d = acum[i];
      // Los extremos no cuentan: en un bucle se sale y se vuelve al mismo sitio.
      if (d < ventanaM * 1.5 || total - d < ventanaM * 1.5) continue;

      const entra = bearing(
        [pts[i - paso][0], pts[i - paso][1]],
        [pts[i][0], pts[i][1]]
      );
      const sale = bearing(
        [pts[i][0], pts[i][1]],
        [pts[i + paso][0], pts[i + paso][1]]
      );
      if (Math.abs(angleDiff(entra, sale)) > 135) encontrados.push(d);
    }
  }

  // Agrupamos: el mismo giro aparece en varias escalas y en puntos contiguos.
  encontrados.sort((a, b) => a - b);
  let cuenta = 0;
  let ultimo = -Infinity;
  for (const d of encontrados) {
    if (d - ultimo > 400) {
      cuenta++;
      ultimo = d;
    }
  }
  return cuenta;
}

/**
 * Recorta los desvios de ida y vuelta de una ruta.
 *
 * Detectarlos y descartar la ruta entera es tirar el trabajo: un bucle de 80 km
 * puede ser estupendo salvo por un pico de 300 m donde el router fue a tocar un
 * punto y se volvio. Y como ese pico va y viene por LA MISMA carretera,
 * eliminarlo deja una ruta perfectamente valida y continua — simplemente no
 * coges el desvio.
 *
 * Se busca, para cada punto, si la ruta ya paso a menos de `toleranciaM` hace
 * poco; si es asi, todo lo que hay entre medias es una excursion y se quita.
 * El tope de `maxDesvioM` evita cargarse el propio bucle, que por definicion
 * vuelve al punto de partida.
 */
export function trimSpurs(
  coords: number[][],
  toleranciaM = 35,
  maxDesvioM = 4000
): number[][] {
  if (coords.length < 6) return coords;

  const salida: number[][] = [coords[0]];
  // Distancia acumulada de lo que llevamos aceptado, para medir hacia atras.
  const acum: number[] = [0];

  for (let i = 1; i < coords.length; i++) {
    const p = coords[i];
    let corte = -1;

    // Hacia atras mientras la excursion siga siendo corta. El -3 evita
    // detectar como desvio el propio zigzag de dos puntos consecutivos.
    for (let k = salida.length - 3; k >= 0; k--) {
      if (acum[salida.length - 1] - acum[k] > maxDesvioM) break;
      if (
        haversine([p[0], p[1]], [salida[k][0], salida[k][1]]) <= toleranciaM
      ) {
        corte = k;
        break;
      }
    }

    if (corte >= 0) {
      // Nos quedamos con lo anterior al desvio y seguimos desde aqui.
      salida.length = corte + 1;
      acum.length = corte + 1;
    }

    const anterior = salida[salida.length - 1];
    salida.push(p);
    acum.push(
      acum[acum.length - 1] +
        haversine([anterior[0], anterior[1]], [p[0], p[1]])
    );
  }

  // Un bucle acaba donde empieza: si el recorte se ha comido el cierre, se
  // devuelve al punto de partida.
  const primero = coords[0];
  const ultimo = salida[salida.length - 1];
  const finOriginal = coords[coords.length - 1];
  if (
    haversine([primero[0], primero[1]], [finOriginal[0], finOriginal[1]]) < toleranciaM &&
    haversine([primero[0], primero[1]], [ultimo[0], ultimo[1]]) > toleranciaM
  ) {
    salida.push(primero.slice());
  }

  return salida.length >= 2 ? salida : coords;
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
