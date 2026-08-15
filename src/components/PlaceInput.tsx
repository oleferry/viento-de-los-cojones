"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LonLat } from "@/lib/types";

interface Hit {
  label: string;
  lon: number;
  lat: number;
}

interface Props {
  label: string;
  placeholder: string;
  value: LonLat | null;
  text: string;
  onChange: (text: string, point: LonLat | null) => void;
  onPickOnMap: () => void;
  picking: boolean;
  accent?: string;
}

export default function PlaceInput({
  label,
  placeholder,
  value,
  text,
  onChange,
  onPickOnMap,
  picking,
  accent = "#ff8a3d",
}: Props) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const skipNext = useRef(false);
  /**
   * Solo buscamos si el texto lo ha escrito la persona. Si viene de fuera (un
   * enlace compartido, o el punto marcado en el mapa) el sitio ya esta
   * resuelto, y lanzar la busqueda solo servia para abrir el desplegable
   * encima del panel nada mas entrar.
   */
  const typed = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (!typed.current) return;
    if (text.trim().length < 3) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`, {
          signal: ac.signal,
        });
        const data = await res.json();
        setHits(data.results ?? []);
        setOpen(true);
        setCursor(-1);
      } catch {
        /* abortado */
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [text]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (h: Hit) => {
    skipNext.current = true;
    typed.current = false;
    onChange(h.label, [h.lon, h.lat]);
    setOpen(false);
    setHits([]);
  };

  return (
    <div ref={box} className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <button
          type="button"
          onClick={onPickOnMap}
          className="-my-2 inline-flex min-h-11 items-center py-2 text-[0.72rem] font-semibold tracking-wide transition-colors md:min-h-0"
          style={{ color: picking ? accent : "var(--color-faint)" }}
        >
          {picking ? "toca el mapa…" : "marcar en el mapa"}
        </button>
      </div>
      <div className="relative">
        <input
          id={id}
          className="field pr-9"
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value, null);
          }}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(hits.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && cursor >= 0) {
              e.preventDefault();
              choose(hits[cursor]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {busy ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
          ) : value ? (
            <span
              className="block h-2 w-2 rounded-full"
              style={{ background: accent, boxShadow: `0 0 0 3px ${accent}33` }}
            />
          ) : null}
        </span>
      </div>

      {open && hits.length > 0 && (
        <ul className="glass scroll-thin absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-xl p-1 text-sm">
          {hits.map((h, i) => (
            <li key={`${h.lon},${h.lat},${i}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(h)}
                className="w-full rounded-lg px-2.5 py-1.5 text-left leading-snug transition-colors"
                style={{
                  background: cursor === i ? "rgba(255,255,255,.07)" : "transparent",
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
