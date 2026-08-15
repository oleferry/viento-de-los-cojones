"use client";

import type { HourOption } from "@/lib/types";
import { fmtDuration, fmtHour } from "@/lib/format";

interface Props {
  hours: HourOption[];
  selected: string;
  onSelect: (iso: string) => void;
  busy?: boolean;
}

/**
 * Franja de horas de salida. La altura de cada barra es el sobrecoste que el
 * viento te va a cobrar frente a salir en calma: cuanto más baja, mejor rato.
 */
export default function HourStrip({ hours, selected, onSelect, busy }: Props) {
  if (hours.length < 2) return null;
  const costs = hours.map((h) => h.windCostS);
  const lo = Math.min(...costs);
  const hi = Math.max(...costs, lo + 60);
  const bestIso = hours.reduce((a, b) => (a.score <= b.score ? a : b)).departure;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Hora de salida</span>
        <span className="text-[0.7rem] text-[var(--color-faint)]">
          sobrecoste del viento
        </span>
      </div>
      <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
        {hours.map((h) => {
          const on = h.departure === selected;
          const isBest = h.departure === bestIso;
          const frac = (h.windCostS - lo) / (hi - lo);
          return (
            <button
              key={h.departure}
              type="button"
              disabled={busy}
              onClick={() => onSelect(h.departure)}
              title={`${fmtDuration(h.timeS)} · viento medio ${(h.meanHeadwind * 3.6).toFixed(0)} km/h en contra`}
              className="group relative flex w-[3.4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-all disabled:opacity-50"
              style={{
                background: on ? "rgba(255,138,61,.14)" : "transparent",
                border: `1px solid ${on ? "rgba(255,138,61,.45)" : "transparent"}`,
              }}
            >
              <span
                className="num text-[0.7rem] font-semibold"
                style={{ color: on ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {fmtHour(h.departure)}
              </span>
              <span className="flex h-9 w-full items-end justify-center">
                <span
                  className="w-2.5 rounded-full transition-all"
                  style={{
                    height: `${8 + frac * 28}px`,
                    background: `linear-gradient(180deg, ${
                      frac < 0.34 ? "#34d399" : frac < 0.67 ? "#facc15" : "#ef4444"
                    }, rgba(255,255,255,.08))`,
                    opacity: on ? 1 : 0.6,
                  }}
                />
              </span>
              <span className="num text-[0.62rem] text-[var(--color-faint)]">
                {Math.round(h.windCostS / 60)}′
              </span>
              {isBest && (
                <span
                  className="absolute -top-1 right-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: "#34d399", boxShadow: "0 0 0 2px rgba(52,211,153,.25)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
