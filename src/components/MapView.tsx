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

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a> &middot; viento <a href="https://open-meteo.com/">Open-Meteo</a>',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#080b11" } },
    {
      id: "carto",
      type: "raster",
      source: "carto",
      paint: { "raster-opacity": 0.82, "raster-saturation": -0.2 },
    },
  ],
};

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
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: coords.map((c) => [c[0], c[1]]) },
        properties: {},
      },
    ],
  };
}

/** Icono de flecha generado en canvas: evita depender de glifos externos. */
function arrowImage(size = 64): ImageData {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const c = size / 2;
  ctx.translate(c, c);
  ctx.beginPath();
  ctx.moveTo(0, -c * 0.78);
  ctx.lineTo(c * 0.42, c * 0.32);
  ctx.lineTo(0, c * 0.08);
  ctx.lineTo(-c * 0.42, c * 0.32);
  ctx.closePath();
  ctx.fillStyle = "#dbeafe";
  ctx.strokeStyle = "rgba(5, 7, 11, 0.85)";
  ctx.lineWidth = size * 0.05;
  ctx.fill();
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
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
}: MapViewProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Marker[]>([]);
  const pickRef = useRef(picking);
  const onPickRef = useRef(onPick);
  pickRef.current = picking;
  onPickRef.current = onPick;

  // --- init -------------------------------------------------------------
  useEffect(() => {
    if (map.current || !holder.current) return;
    const m = new MLMap({
      container: holder.current,
      style: STYLE,
      center: [-4.93, 41.99], // Tierra de Campos
      zoom: 9,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(
      new GeolocateControl({ trackUserLocation: false }),
      "top-right"
    );
    m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    m.on("load", () => {
      if (!m.hasImage("wind-arrow")) m.addImage("wind-arrow", arrowImage(), { pixelRatio: 3 });

      m.addSource("alts", { type: "geojson", data: EMPTY });
      m.addSource("route", { type: "geojson", data: EMPTY });
      m.addSource("arrows", { type: "geojson", data: EMPTY });
      m.addSource("cursor", { type: "geojson", data: EMPTY });

      m.addLayer({
        id: "alts-line",
        type: "line",
        source: "alts",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#7c8ba1",
          "line-width": 2.5,
          "line-opacity": 0.35,
          "line-dasharray": [2, 2],
        },
      });

      m.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#05070b",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 6, 14, 12],
          "line-opacity": 0.9,
        },
      });

      m.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 8],
          "line-color": [
            "interpolate",
            ["linear"],
            ["get", "hw"],
            -6, "#34d399",
            -2, "#a3e635",
            0, "#facc15",
            2, "#fb923c",
            6, "#ef4444",
          ],
        },
      });

      m.addLayer({
        id: "wind-arrows",
        type: "symbol",
        source: "arrows",
        layout: {
          "icon-image": "wind-arrow",
          "icon-rotate": ["get", "toward"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-size": [
            "interpolate",
            ["linear"],
            ["get", "ws"],
            0, 0.28,
            10, 0.6,
          ],
        },
        paint: { "icon-opacity": 0.7 },
      });

      m.addLayer({
        id: "cursor-dot",
        type: "circle",
        source: "cursor",
        paint: {
          "circle-radius": 6,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#05070b",
          "circle-stroke-width": 2,
        },
      });

      ready.current = true;
      m.resize();
    });

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });

    m.on("mousemove", "route-line", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = "crosshair";
      const p = f.properties as Record<string, number>;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-weight:600;margin-bottom:2px">km ${Number(p.km).toFixed(1)} &middot; ${Math.round(Number(p.min))} min</div>` +
            `<div style="color:#93a1b3">${Number(p.kmh).toFixed(1)} km/h &middot; viento ${windLabel(Number(p.yaw))} ` +
            `(${(Number(p.hw) * 3.6).toFixed(0)} km/h ${Number(p.hw) >= 0 ? "en contra" : "a favor"})</div>`
        )
        .addTo(m);
    });
    m.on("mouseleave", "route-line", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });

    m.on("click", (e: MapMouseEvent) => {
      if (!pickRef.current) return;
      onPickRef.current?.([
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ]);
    });

    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

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
    const apply = () => {
      if (!ready.current) return;
      const routeSrc = m.getSource("route") as GeoJSONSource | undefined;
      const arrowSrc = m.getSource("arrows") as GeoJSONSource | undefined;
      const altSrc = m.getSource("alts") as GeoJSONSource | undefined;
      if (!routeSrc || !arrowSrc || !altSrc) return;

      routeSrc.setData(best ? trackToSegments(best.track) : EMPTY);
      arrowSrc.setData(best && showArrows ? windArrows(best.track) : EMPTY);
      altSrc.setData(
        showAlternatives && alternatives.length
          ? {
              type: "FeatureCollection",
              features: alternatives.flatMap((a) => lineOf(a.geometry.coords).features),
            }
          : EMPTY
      );
    };
    if (ready.current) apply();
    else m.once("idle", apply);
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
      const mk = new Marker({ element: el }).setLngLat(p).addTo(m);
      markers.current.push(mk);
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
      m.fitBounds(b, { padding: { top: 70, bottom: 70, left: 70, right: 70 }, duration: 900 });
    } else if (start) {
      m.easeTo({ center: start, zoom: Math.max(m.getZoom(), 11), duration: 700 });
    }
  }, [best, start]);

  // --- punto resaltado desde la grafica ----------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
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

  return <div ref={holder} className="absolute inset-0" />;
}

