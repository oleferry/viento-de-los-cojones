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
  // "voyager" en claro porque dibuja las carreteras secundarias y los caminos
  // mucho mejor que positron, y aqui eso es justo lo que se quiere ver.
  const slug = theme === "light" ? "voyager" : "dark_all";
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

/** Icono de flecha generado en canvas: evita depender de glifos externos. */
function arrowImage(size = 64): ImageData | null {
  try {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const c = size / 2;
    ctx.translate(c, c);
    ctx.beginPath();
    ctx.moveTo(0, -c * 0.78);
    ctx.lineTo(c * 0.42, c * 0.32);
    ctx.lineTo(0, c * 0.08);
    ctx.lineTo(-c * 0.42, c * 0.32);
    ctx.closePath();
    ctx.fillStyle = "#e0f2fe";
    ctx.strokeStyle = "rgba(5, 7, 11, 0.9)";
    ctx.lineWidth = size * 0.055;
    ctx.fill();
    ctx.stroke();
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
}: MapViewProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);

  // Los handlers de MapLibre viven fuera del ciclo de React, asi que leen el
  // estado por referencia para no quedarse con una version vieja.
  const props = useRef({ best, alternatives, showArrows, showAlternatives, picking, onPick });
  props.current = { best, alternatives, showArrows, showAlternatives, picking, onPick };

  /**
   * Instala fuentes y capas. Es idempotente y se vuelve a llamar cada vez que
   * cambia el estilo del mapa (cambiar de basemap tira todas las capas), asi
   * que nunca dependemos de que un unico evento `load` llegue bien.
   */
  const install = (m: MLMap) => {
    if (m.getLayer("route-line")) return;

    let hasArrow = m.hasImage("wind-arrow");
    if (!hasArrow) {
      // Si el icono falla no puede llevarse por delante el resto de capas: sin
      // este try la ruta entera desaparecia del mapa por una flecha.
      try {
        const img = arrowImage();
        if (img) {
          m.addImage("wind-arrow", img, { pixelRatio: 3 });
          hasArrow = true;
        }
      } catch (err) {
        console.warn("[mapa] no se pudo crear el icono de viento", err);
      }
    }

    for (const id of ["alts", "route", "arrows", "cursor"]) {
      if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: EMPTY });
    }

    m.addLayer({
      id: "alts-line",
      type: "line",
      source: "alts",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": theme === "light" ? "#475569" : "#94a3b8",
        "line-width": 3,
        "line-opacity": 0.45,
        "line-dasharray": [2, 2],
      },
    });

    m.addLayer({
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

    m.addLayer({
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
      m.addLayer({
        id: "wind-arrows",
        type: "symbol",
        source: "arrows",
        layout: {
          "icon-image": "wind-arrow",
          "icon-rotate": ["get", "toward"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["get", "ws"], 0, 0.3, 10, 0.62],
        },
        paint: { "icon-opacity": 0.85 },
      });
    }

    m.addLayer({
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
  };

  /** Vuelca el estado actual en las fuentes. Seguro de llamar en cualquier momento. */
  const pushData = (m: MLMap) => {
    const { best: b, alternatives: alts, showArrows: arrows, showAlternatives: showAlts } =
      props.current;
    const route = m.getSource("route") as GeoJSONSource | undefined;
    const arrowSrc = m.getSource("arrows") as GeoJSONSource | undefined;
    const altSrc = m.getSource("alts") as GeoJSONSource | undefined;
    if (!route) return;

    route.setData(b ? trackToSegments(b.track) : EMPTY);
    arrowSrc?.setData(b && arrows ? windArrows(b.track) : EMPTY);
    altSrc?.setData(
      showAlts && alts?.length
        ? { type: "FeatureCollection", features: alts.map((a) => lineOf(a.geometry.coords)) }
        : EMPTY
    );
  };

  // --- init -------------------------------------------------------------
  useEffect(() => {
    const node = holder.current;
    if (map.current || !node) return;
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
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new GeolocateControl({ trackUserLocation: false }), "top-right");
    m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    m.on("error", (e) => {
      // Sin esto los fallos de teselas o de estilo se tragan en silencio y el
      // mapa aparece en negro sin decir por que.
      console.error("[mapa]", e.error ?? e);
    });

    // Se vuelca SIEMPRE, tanto al cargar como al cambiar de basemap: asi la
    // ruta reaparece sola pase lo que pase con el estilo.
    const onStyle = () => {
      if (!m.isStyleLoaded()) return;
      try {
        install(m);
        pushData(m);
      } catch (err) {
        console.error("[mapa] instalando capas", err);
      }
    };
    m.on("load", onStyle);
    // Cambiar de basemap destruye las capas: `styledata` las reinstala.
    m.on("styledata", onStyle);

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

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- cambio de basemap -------------------------------------------------
  const firstTheme = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    m.setStyle(styleFor(theme)); // `styledata` reinstalara las capas
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
    if (!m) return;
    if (m.isStyleLoaded()) {
      install(m);
      pushData(m);
    } else {
      m.once("idle", () => {
        install(m);
        pushData(m);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, alternatives, showArrows, showAlternatives]);

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
