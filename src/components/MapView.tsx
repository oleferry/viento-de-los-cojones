"use client";

import { useEffect, useRef } from "react";
import {
  GeolocateControl,
  LngLatBounds,
  Map as MLMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  getWorkerUrl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import type { Candidate, LonLat, TrackPoint } from "@/lib/types";
import { windLabel } from "@/lib/format";

export type MapTheme = "dark" | "light";

const ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a> &middot; ' +
  'viento <a href="https://open-meteo.com/">Open-Meteo</a>';

function styleFor(theme: MapTheme): StyleSpecification {
  // Voyager en claro porque dibuja las carreteras secundarias y los caminos
  // mucho mejor que positron, y aqui eso es justo lo que se quiere ver.
  // OJO con la ruta: voyager cuelga de `rastertiles/`, mientras que dark_all y
  // light_all estan en la raiz. Con la ruta equivocada CARTO devuelve un 404
  // en HTML, y como un 404 no lleva cabeceras CORS el navegador lo denuncia
  // como error de CORS, que despista muchisimo.
  const slug = theme === "light" ? "rastertiles/voyager" : "dark_all";
  const bg = theme === "light" ? "#eef1f5" : "#080b11";
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: ["a", "b", "c"].map(
          (s) => `https://${s}.basemaps.cartocdn.com/${slug}/{z}/{x}/{y}@2x.png`
        ),
        tileSize: 256,
        maxzoom: 19,
        attribution: ATTRIB,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": bg } },
      { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 1 } },
    ],
  };
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/**
 * MapLibre 6 saca la URL de su worker de `import.meta.url` y se rinde si no
 * empieza por http, cosa que pasa siempre bajo un bundler: se queda en cadena
 * vacia, hace `new Worker("")` y el worker muere en silencio. Como TODA fuente
 * GeoJSON se tesela alli, la ruta y las flechas no aparecen nunca, y no se ve
 * un solo error en consola porque el basemap raster va por el hilo principal.
 *
 * `scripts/copy-maplibre-worker.mjs` deja el worker en public/ en cada build.
 */
function ensureWorker() {
  try {
    if (!/^https?:/i.test(getWorkerUrl() || "")) {
      setWorkerUrl(
        new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href
      );
    }
  } catch (err) {
    console.error("[mapa] no se pudo configurar el worker de MapLibre", err);
  }
}

function trackToSegments(track: TrackPoint[]) {
  const features = [];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    features.push({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      },
      properties: { hw: a.hw, yaw: a.yaw, km: a.km, min: a.min, kmh: a.kmh, ws: a.ws },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

/** Flechas de viento cada N puntos, orientadas hacia donde SOPLA el viento. */
function windArrows(track: TrackPoint[]) {
  const step = Math.max(1, Math.floor(track.length / 22));
  const features = [];
  for (let i = 0; i < track.length; i += step) {
    const p = track[i];
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      properties: { toward: (p.wd + 180) % 360, ws: p.ws, hw: p.hw },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

/** Campo de viento de la comarca: una flecha por punto de la rejilla. */
function windGrid(
  grid: { lon: number; lat: number; dir: number; ms: number }[] | undefined
) {
  if (!grid?.length) return EMPTY;
  return {
    type: "FeatureCollection" as const,
    features: grid.map((g) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [g.lon, g.lat] },
      properties: { toward: (g.dir + 180) % 360, ms: g.ms },
    })),
  };
}

function lineOf(coords: number[][]) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: coords.map((c) => [c[0], c[1]]),
    },
    properties: {},
  };
}

/**
 * Icono de flecha generado en canvas: evita depender de glifos externos.
 * Lleva un disco oscuro detras porque las flechas van encima de la propia
 * linea de la ruta, que es de colores vivos, y sin fondo se pierden.
 */
function arrowImage(size = 64): ImageData | null {
  try {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const c = size / 2;

    ctx.beginPath();
    ctx.arc(c, c, c * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(6, 10, 18, 0.82)";
    ctx.fill();
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = "rgba(224, 242, 254, 0.55)";
    ctx.stroke();

    ctx.translate(c, c);
    ctx.beginPath();
    ctx.moveTo(0, -c * 0.66);
    ctx.lineTo(c * 0.4, c * 0.42);
    ctx.lineTo(0, c * 0.16);
    ctx.lineTo(-c * 0.4, c * 0.42);
    ctx.closePath();
    ctx.fillStyle = "#e0f2fe";
    ctx.fill();
    return ctx.getImageData(0, 0, size, size);
  } catch {
    return null;
  }
}

export interface MapViewProps {
  best?: Candidate | null;
  alternatives?: Candidate[];
  start?: LonLat | null;
  end?: LonLat | null;
  shape: "circular" | "lineal";
  picking: null | "start" | "end";
  onPick?: (p: LonLat) => void;
  showArrows: boolean;
  showAlternatives: boolean;
  hoverKm?: number | null;
  theme: MapTheme;
  /** Rejilla de viento de la comarca, para pintar el campo de fondo. */
  windGrid?: { lon: number; lat: number; dir: number; ms: number }[];
}

export default function MapView({
  best,
  alternatives = [],
  start,
  end,
  shape,
  picking,
  onPick,
  showArrows,
  showAlternatives,
  hoverKm,
  theme,
  windGrid: grid,
}: MapViewProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  /**
   * Llevamos nosotros la cuenta de si las capas estan puestas. No se puede
   * preguntar `m.getLayer(...)`: mientras el estilo no este "cargado" devuelve
   * undefined aunque la capa exista, y entonces se reintenta anadirla y salta.
   */
  const installed = useRef(false);

  // Los handlers de MapLibre viven fuera del ciclo de React, asi que leen el
  // estado por referencia para no quedarse con una version vieja.
  const props = useRef({
    best, alternatives, showArrows, showAlternatives, picking, onPick, windGrid: grid,
  });
  props.current = {
    best, alternatives, showArrows, showAlternatives, picking, onPick, windGrid: grid,
  };

  /**
   * Instala fuentes y capas. Es idempotente y se vuelve a llamar cada vez que
   * cambia el estilo del mapa (cambiar de basemap tira todas las capas), asi
   * que nunca dependemos de que un unico evento `load` llegue bien.
   */
  const install = (m: MLMap) => {
    if (installed.current) return;

    // Cada pieza va aislada: que falle una no puede dejar el mapa sin las
    // demas, que es justo lo que pasaba (un fallo al crear el icono, o un
    // "already exists", abortaba la instalacion entera y la ruta no llegaba
    // nunca a pintarse). Y si algo falla de verdad NO damos la instalacion por
    // buena, para que el reintento vuelva a intentarlo.
    let failed = false;
    const attempt = (what: string, fn: () => void) => {
      try {
        fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "already exists" no es un fallo: la capa esta, que es lo que queriamos.
        if (/already exists/i.test(msg)) return;
        failed = true;
        if (!/not done loading/i.test(msg)) console.warn(`[mapa] ${what}:`, msg);
      }
    };

    let hasArrow = m.hasImage("wind-arrow");
    if (!hasArrow) {
      attempt("icono de viento", () => {
        const img = arrowImage();
        if (img) {
          m.addImage("wind-arrow", img, { pixelRatio: 2 });
          hasArrow = true;
        }
      });
    }

    for (const id of ["field", "alts", "route", "arrows", "cursor"]) {
      attempt(`fuente ${id}`, () => {
        if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: EMPTY });
      });
    }

    const layer = (spec: Parameters<MLMap["addLayer"]>[0]) =>
      attempt(`capa ${spec.id}`, () => m.addLayer(spec));

    // El campo de viento va DEBAJO de todo: es el fondo sobre el que se lee la
    // ruta, no debe competir con ella.
    if (hasArrow) {
      layer({
        id: "wind-field",
        type: "symbol",
        source: "field",
        layout: {
          "icon-image": "wind-arrow",
          "icon-rotate": ["get", "toward"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["get", "ms"], 0, 0.4, 5, 0.6, 12, 0.95],
        },
        paint: { "icon-opacity": theme === "light" ? 0.3 : 0.34 },
      });
    }

    layer({
      id: "alts-line",
      type: "line",
      source: "alts",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": theme === "light" ? "#334155" : "#a5b4c8",
        "line-width": 3.5,
        "line-opacity": 0.6,
        "line-dasharray": [1.6, 1.6],
      },
    });

    layer({
      id: "route-casing",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": theme === "light" ? "#ffffff" : "#05070b",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 15],
        "line-opacity": 0.95,
      },
    });

    layer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10],
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "hw"],
          -6, "#10b981",
          -2, "#84cc16",
          0, "#eab308",
          2, "#f97316",
          6, "#dc2626",
        ],
      },
    });

    if (hasArrow) {
      layer({
        id: "wind-arrows",
        type: "symbol",
        source: "arrows",
        layout: {
          "icon-image": "wind-arrow",
          "icon-rotate": ["get", "toward"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // El tamano crece con la fuerza del viento: se lee de un vistazo
          // donde aprieta sin tener que mirar numeros.
          "icon-size": [
            "interpolate",
            ["linear"],
            ["get", "ws"],
            0, 0.55,
            4, 0.8,
            10, 1.15,
          ],
        },
        paint: { "icon-opacity": 0.95 },
      });
    }

    layer({
      id: "cursor-dot",
      type: "circle",
      source: "cursor",
      paint: {
        "circle-radius": 6,
        "circle-color": theme === "light" ? "#0f172a" : "#ffffff",
        "circle-stroke-color": theme === "light" ? "#ffffff" : "#05070b",
        "circle-stroke-width": 2.5,
      },
    });

    // Doble comprobacion: ni un solo fallo, y las cuatro fuentes existiendo de
    // verdad. `getSource` si se puede consultar antes de que el estilo termine.
    installed.current =
      !failed &&
      ["alts", "route", "arrows", "cursor"].every((id) => {
        try {
          return !!m.getSource(id);
        } catch {
          return false;
        }
      });
  };

  /**
   * Vuelca el estado actual en las fuentes. Se puede llamar en cualquier
   * momento y nunca lanza: si las fuentes aun no estan, devuelve false y quien
   * llama lo reintenta. Lo importante es que NO depende de que el estilo este
   * "cargado", porque en MapLibre eso incluye las teselas del basemap y basta
   * con que una falle para que no lo este nunca.
   */
  const pushData = (m: MLMap): boolean => {
    const { best: b, alternatives: alts, showArrows: arrows, showAlternatives: showAlts } =
      props.current;
    try {
      const route = m.getSource("route") as GeoJSONSource | undefined;
      if (!route) return false;
      const arrowSrc = m.getSource("arrows") as GeoJSONSource | undefined;
      const altSrc = m.getSource("alts") as GeoJSONSource | undefined;
      const fieldSrc = m.getSource("field") as GeoJSONSource | undefined;
      fieldSrc?.setData(arrows ? windGrid(props.current.windGrid) : EMPTY);

      const data = b ? trackToSegments(b.track) : EMPTY;
      route.setData(data);
      (window as unknown as { __vdcPush?: unknown }).__vdcPush = {
        features: data.features.length,
        best: b?.id ?? null,
        at: new Date().toISOString().slice(11, 19),
      };
      arrowSrc?.setData(b && arrows ? windArrows(b.track) : EMPTY);
      altSrc?.setData(
        showAlts && alts?.length
          ? { type: "FeatureCollection", features: alts.map((a) => lineOf(a.geometry.coords)) }
          : EMPTY
      );
      m.triggerRepaint();
      return true;
    } catch (err) {
      console.warn("[mapa] volcando datos:", err);
      return false;
    }
  };

  /**
   * Instala si hace falta y vuelca los datos. Reintenta hasta que el estilo
   * acepte las capas: MapLibre rechaza `addSource` con "Style is not done
   * loading" hasta que ha terminado de parsear, y no hay forma publica y fiable
   * de preguntar por ese momento exacto (`isStyleLoaded()` mide otra cosa).
   */
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sync = (m: MLMap, tries = 0) => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    install(m);
    if (installed.current && pushData(m)) return;
    if (tries < 100) {
      syncTimer.current = setTimeout(() => sync(m, tries + 1), 100);
    } else {
      console.error("[mapa] no se pudieron instalar las capas de la ruta");
    }
  };

  // --- init -------------------------------------------------------------
  useEffect(() => {
    const node = holder.current;
    if (map.current || !node) return;
    ensureWorker(); // antes de crear el mapa: si no, no hay teselado de GeoJSON
    const m = new MLMap({
      container: node,
      style: styleFor(theme),
      center: [-4.93, 41.99], // Tierra de Campos
      zoom: 9,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = m;
    installed.current = false;
    appliedTheme.current = theme;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new GeolocateControl({ trackUserLocation: false }), "top-right");
    m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    m.on("error", (e) => {
      // Sin esto los fallos de teselas o de estilo se tragan en silencio y el
      // mapa aparece en negro sin decir por que.
      console.error("[mapa]", e.error ?? e);
    });

    // OJO: aqui NO se puede preguntar `isStyleLoaded()`. En MapLibre eso
    // significa "estilo Y todas las teselas cargadas", asi que basta con que
    // una tesela del basemap falle o tarde para que sea false indefinidamente.
    // Usarlo como puerta dejaba el mapa con las capas puestas pero vacias.
    const onStyle = () => sync(m);
    m.on("load", onStyle);
    // Cambiar de basemap destruye las capas: `styledata` las reinstala.
    m.on("styledata", onStyle);
    sync(m);

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    m.on("mousemove", "route-line", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = "crosshair";
      const p = f.properties as Record<string, number>;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-weight:600;margin-bottom:2px">km ${Number(p.km).toFixed(1)} &middot; ${Math.round(Number(p.min))} min</div>` +
            `<div style="opacity:.7">${Number(p.kmh).toFixed(1)} km/h &middot; viento ${windLabel(Number(p.yaw))} ` +
            `(${Math.abs(Number(p.hw) * 3.6).toFixed(0)} km/h ${Number(p.hw) >= 0 ? "en contra" : "a favor"})</div>`
        )
        .addTo(m);
    });
    m.on("mouseleave", "route-line", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });

    m.on("click", (e: MapMouseEvent) => {
      if (!props.current.picking) return;
      props.current.onPick?.([
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ]);
    });

    // MapLibre mide el contenedor una sola vez al crearse. Si en ese momento el
    // layout aun no ha cuajado (fuentes, dvh en movil, el panel abriendose) el
    // canvas se queda con un tamano equivocado y el mapa aparece recortado.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(node);
    requestAnimationFrame(() => m.resize());

    // Accesible desde la consola para diagnosticar el mapa sin instrumentar
    // nada: `__vdcMap.getSource('route')` y compania.
    (window as unknown as { __vdcMap?: MLMap }).__vdcMap = m;

    return () => {
      ro.disconnect();
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = null;
      m.remove();
      map.current = null;
      installed.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- cambio de basemap -------------------------------------------------
  /**
   * El tema con el que se creo el mapa actual. Se reinicia al crear el mapa,
   * no al montar el componente: en desarrollo React monta, desmonta y vuelve a
   * montar, y un flag "primera vez" a nivel de componente hacia que el segundo
   * mapa recibiera un setStyle nada mas nacer, con el estilo a medio parsear.
   */
  const appliedTheme = useRef<MapTheme>(theme);
  useEffect(() => {
    const m = map.current;
    if (!m || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    installed.current = false; // el cambio de estilo se lleva las capas por delante
    m.setStyle(styleFor(theme)); // `styledata` disparara sync()
    sync(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // --- cursor de picado --------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  // --- datos -------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (m) sync(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, alternatives, showArrows, showAlternatives, grid]);

  // --- marcadores --------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];

    const make = (p: LonLat, color: string, title: string) => {
      const el = document.createElement("div");
      el.title = title;
      el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:2.5px solid #05070b;box-shadow:0 0 0 2px ${color}55, 0 4px 12px rgba(0,0,0,.6)`;
      markers.current.push(new Marker({ element: el }).setLngLat(p).addTo(m));
    };
    if (start) make(start, "#ff8a3d", "Salida");
    if (shape === "lineal" && end) make(end, "#4cc9f0", "Llegada");
  }, [start, end, shape]);

  // --- encuadre ----------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const coords = best?.geometry.coords;
    if (coords?.length) {
      const b = new LngLatBounds();
      for (const c of coords) b.extend([c[0], c[1]]);
      m.fitBounds(b, {
        padding: { top: 70, bottom: 70, left: 70, right: 70 },
        duration: 900,
      });
    } else if (start) {
      m.easeTo({ center: start, zoom: Math.max(m.getZoom(), 11), duration: 700 });
    }
  }, [best, start]);

  // --- punto resaltado desde la grafica ----------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource("cursor") as GeoJSONSource | undefined;
    if (!src) return;
    if (hoverKm == null || !best) {
      src.setData(EMPTY);
      return;
    }
    let closest = best.track[0];
    let bestDiff = Infinity;
    for (const p of best.track) {
      const d = Math.abs(p.km - hoverKm);
      if (d < bestDiff) {
        bestDiff = d;
        closest = p;
      }
    }
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [closest.lon, closest.lat] },
          properties: {},
        },
      ],
    });
  }, [hoverKm, best]);

  return <div ref={holder} className="absolute inset-0 h-full w-full" />;
}
