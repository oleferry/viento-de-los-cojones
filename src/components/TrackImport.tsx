"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Import");

  const cargar = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const leida = await readTrackFile(file);
      onLoad({ ...leida, name: leida.name || t("defaultName") });
    } catch (err) {
      onLoad(null);
      setError(t(err instanceof ImportError ? err.code : "unreadable"));
    }
  };

  return (
    <div>
      <div className="label mb-1.5">{t("yourRoute")}</div>

      {track ? (
        <div className="card flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.82rem] font-semibold">
              {track.name}
            </span>
            <span className="num block text-[0.66rem] text-[var(--color-faint)]">
              {(polylineLength(track.coords) / 1000).toFixed(1)} km ·{" "}
              {t("points", { n: track.coords.length })} ·{" "}
              {track.hasElevation ? t("withElevation") : t("withoutElevation")}
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
            {t("remove")}
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
          <span className="text-[0.82rem] font-semibold">{t("dropHere")}</span>
          <span className="text-[0.68rem] text-[var(--color-faint)]">
            {t("orTap")}
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
        {t("blurb")}
      </p>
    </div>
  );
}
