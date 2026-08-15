"use client";

import { useEffect, useState } from "react";
import type { SavedRoute } from "@/lib/account";

interface Props {
  /** null mientras no se sabe si hay sesion. */
  activo: boolean;
  onCargar: (nombre: string, coords: number[][]) => void;
}

/**
 * Las rutas guardadas de la cuenta. La geometria no viaja en el listado (son
 * miles de pares por ruta), solo al abrir una.
 */
export default function SavedRoutes({ activo, onCargar }: Props) {
  const [rutas, setRutas] = useState<SavedRoute[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) {
      setRutas(null);
      return;
    }
    fetch("/api/routes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRutas(d.routes ?? []))
      .catch(() => setRutas([]));
  }, [activo]);

  if (!activo || !rutas) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="label flex w-full items-center justify-between hover:text-[var(--color-muted)]"
      >
        <span>Mis rutas ({rutas.length})</span>
        <span className="text-[var(--color-faint)]">{abierto ? "−" : "+"}</span>
      </button>

      {abierto &&
        (rutas.length === 0 ? (
          <p className="rise mt-1.5 text-[0.7rem] leading-snug text-[var(--color-faint)]">
            Todavía no has guardado ninguna. Traza o importa una y dale a
            «Guardar ruta».
          </p>
        ) : (
          <ul className="rise scroll-thin mt-1.5 max-h-52 space-y-1 overflow-y-auto">
            {rutas.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={async () => {
                    setOcupado(r.id);
                    try {
                      const d = await (
                        await fetch(`/api/routes?id=${r.id}`, { cache: "no-store" })
                      ).json();
                      if (d.route?.coords) onCargar(d.route.name, d.route.coords);
                    } finally {
                      setOcupado(null);
                    }
                  }}
                  className="card min-w-0 flex-1 px-2.5 py-1.5 text-left transition-colors hover:border-white/20 disabled:opacity-50"
                >
                  <span className="block truncate text-[0.76rem] font-medium">
                    {r.name}
                  </span>
                  <span className="num block text-[0.64rem] text-[var(--color-faint)]">
                    {(r.distanceM / 1000).toFixed(1)} km
                    {r.ascentM ? ` · +${r.ascentM} m` : ""} ·{" "}
                    {r.kind === "imported" ? "importada" : "trazada"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${r.name}`}
                  onClick={async () => {
                    const d = await (
                      await fetch(`/api/routes?id=${r.id}`, { method: "DELETE" })
                    ).json();
                    setRutas(d.routes ?? []);
                  }}
                  className="shrink-0 px-1 text-[0.9rem] leading-none text-[var(--color-faint)] transition-colors hover:text-red-300"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
