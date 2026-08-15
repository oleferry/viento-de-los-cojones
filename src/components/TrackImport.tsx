"use client";

import { useRef, useState } from "react";
import { ImportError, readTrackFile, type ImportedTrack } from "@/lib/gpxImport";
import { polylineLength } from "@/lib/geo";

interface Props {
  track: ImportedTrack | null;
  onLoad: (t: ImportedTrack | null) => void;
}

export default function TrackImport({ track, onLoad }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onLoad(await readTrackFile(file));
    } catch (err) {
      onLoad(null);
      setError(
        err instanceof ImportError
          ? err.message
          : "No se ha podido leer el fichero."
      );
    }
  };

  return (
    <div>
      <div className="label mb-1.5">Tu ruta</div>

      {track ? (
        <div className="card flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.82rem] font-semibold">
              {track.name}
            </span>
            <span className="num block text-[0.66rem] text-[var(--color-faint)]">
              {(polylineLength(track.coords) / 1000).toFixed(1)} km ·{" "}
              {track.coords.length} puntos ·{" "}
              {track.hasElevation ? "con altimetría" : "sin altimetría"}
            </span>
          </span>
          <button
            type="button"
            className="btn !px-2.5 !py-1 !text-[0.7rem]"
            onClick={() => {
              onLoad(null);
              if (input.current) input.current.value = "";
            }}
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            cargar(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-5 transition-colors"
          style={{
            borderColor: encima ? "var(--color-accent)" : "var(--color-line)",
            background: encima ? "var(--color-accent-soft)" : "rgba(255,255,255,.02)",
          }}
        >
          <span className="text-[0.82rem] font-semibold">
            Suelta aquí tu GPX
          </span>
          <span className="text-[0.68rem] text-[var(--color-faint)]">
            o toca para buscarlo · GPX, TCX o KML
          </span>
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept=".gpx,.tcx,.kml,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => cargar(e.target.files?.[0])}
      />

      {error && (
        <p className="mt-1.5 text-[0.7rem] leading-snug text-red-300">{error}</p>
      )}

      <p className="mt-1.5 text-[0.65rem] leading-snug text-[var(--color-faint)]">
        Exporta la ruta de Strava, Komoot o Garmin y te digo a qué hora hacerla y
        en qué sentido. El fichero se lee en tu navegador; al servidor solo van
        las coordenadas.
      </p>
    </div>
  );
}
