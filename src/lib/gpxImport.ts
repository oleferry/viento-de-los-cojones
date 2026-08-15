/**
 * Lectura de rutas propias.
 *
 * Se hace en el navegador con DOMParser: el fichero ya esta ahi, no hay que
 * subirlo a ningun sitio y nos ahorramos una dependencia de XML en el servidor.
 * Al servidor solo viajan las coordenadas.
 */

export interface ImportedTrack {
  name: string;
  /** [lon, lat] o [lon, lat, ele]. */
  coords: number[][];
  /** Si el fichero traia altitudes. */
  hasElevation: boolean;
}

export class ImportError extends Error {}

const num = (s: string | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

function fromGPX(doc: Document): ImportedTrack | null {
  // Preferimos <trkpt> (traza grabada); si no hay, <rtept> (ruta planificada).
  let pts = Array.from(doc.getElementsByTagName("trkpt"));
  if (!pts.length) pts = Array.from(doc.getElementsByTagName("rtept"));
  if (!pts.length) return null;

  const coords: number[][] = [];
  let conEle = 0;
  for (const p of pts) {
    const lat = num(p.getAttribute("lat"));
    const lon = num(p.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = num(p.getElementsByTagName("ele")[0]?.textContent);
    if (Number.isFinite(ele)) {
      coords.push([lon, lat, ele]);
      conEle++;
    } else {
      coords.push([lon, lat]);
    }
  }
  const name =
    doc.getElementsByTagName("name")[0]?.textContent?.trim() || "Mi ruta";
  return { name, coords, hasElevation: conEle > coords.length * 0.5 };
}

function fromTCX(doc: Document): ImportedTrack | null {
  const pts = Array.from(doc.getElementsByTagName("Trackpoint"));
  if (!pts.length) return null;
  const coords: number[][] = [];
  let conEle = 0;
  for (const p of pts) {
    const lat = num(p.getElementsByTagName("LatitudeDegrees")[0]?.textContent);
    const lon = num(p.getElementsByTagName("LongitudeDegrees")[0]?.textContent);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = num(p.getElementsByTagName("AltitudeMeters")[0]?.textContent);
    if (Number.isFinite(ele)) {
      coords.push([lon, lat, ele]);
      conEle++;
    } else {
      coords.push([lon, lat]);
    }
  }
  const name = doc.getElementsByTagName("Name")[0]?.textContent?.trim() || "Mi ruta";
  return { name, coords, hasElevation: conEle > coords.length * 0.5 };
}

function fromKML(doc: Document): ImportedTrack | null {
  const nodo = doc.getElementsByTagName("coordinates")[0];
  if (!nodo?.textContent) return null;
  const coords: number[][] = [];
  let conEle = 0;
  for (const trozo of nodo.textContent.trim().split(/\s+/)) {
    const [lon, lat, ele] = trozo.split(",").map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Number.isFinite(ele) && ele !== 0) {
      coords.push([lon, lat, ele]);
      conEle++;
    } else {
      coords.push([lon, lat]);
    }
  }
  const name = doc.getElementsByTagName("name")[0]?.textContent?.trim() || "Mi ruta";
  return coords.length ? { name, coords, hasElevation: conEle > coords.length * 0.5 } : null;
}

/**
 * Reduce la traza a un maximo de puntos conservando la forma.
 *
 * Una grabacion de Strava trae un punto por segundo: 30.000 para una salida de
 * ocho horas, y mandarlos todos es varios megas de JSON para una simulacion que
 * de todas formas trocea en tramos de 400 m. Se muestrea por DISTANCIA, no
 * cada n puntos, para no deformar las curvas.
 */
function aligerar(coords: number[][], maxPuntos = 3000): number[][] {
  if (coords.length <= maxPuntos) return coords;
  const salida: number[][] = [coords[0]];
  const paso = coords.length / maxPuntos;
  for (let i = paso; i < coords.length - 1; i += paso) {
    salida.push(coords[Math.floor(i)]);
  }
  salida.push(coords[coords.length - 1]);
  return salida;
}

export function parseTrack(texto: string, nombreFichero: string): ImportedTrack {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(texto, "application/xml");
  } catch {
    throw new ImportError("No se ha podido leer el fichero.");
  }
  if (doc.getElementsByTagName("parsererror").length) {
    throw new ImportError("El fichero no es XML válido.");
  }

  const track = fromGPX(doc) ?? fromTCX(doc) ?? fromKML(doc);
  if (!track || track.coords.length < 2) {
    throw new ImportError(
      "No he encontrado ninguna traza dentro. Sirven GPX, TCX y KML con puntos de ruta."
    );
  }

  const base = nombreFichero.replace(/\.[^.]+$/, "");
  return {
    ...track,
    name: track.name === "Mi ruta" && base ? base : track.name,
    coords: aligerar(track.coords),
  };
}

export async function readTrackFile(file: File): Promise<ImportedTrack> {
  if (file.size > 25 * 1024 * 1024) {
    throw new ImportError("El fichero pesa más de 25 MB.");
  }
  return parseTrack(await file.text(), file.name);
}
