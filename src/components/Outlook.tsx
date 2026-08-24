"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { HourOption } from "@/lib/types";
import { fmtDuration, fmtHour } from "@/lib/format";

interface Props {
  outlook: HourOption[];
  selected: string;
  onSelect: (iso: string) => void;
  busy?: boolean;
}

/**
 * "¿Y si voy otro día?". La misma ruta, evaluada en cada hora de luz de los
 * próximos días. No cuesta ni una petición extra de routing, así que sale
 * gratis y contesta la pregunta que uno se hace de verdad al ver que hoy toca
 * palo: cuándo conviene hacerla.
 */
export default function Outlook({ outlook, selected, onSelect, busy }: Props) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Outlook");
  const locale = useLocale();
  const bcp47 = locale === "en" ? "en-GB" : "es-ES";

  const days = useMemo(() => {
    const map = new Map<string, HourOption[]>();
    for (const h of outlook) {
      const d = new Date(h.departure);
      const key = d.toLocaleDateString(bcp47, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const list = map.get(key);
      if (list) list.push(h);
      else map.set(key, [h]);
    }
    return [...map.entries()].map(([label, hours]) => ({
      label,
      hours,
      best: hours.reduce((a, b) => (a.score <= b.score ? a : b)),
    }));
  }, [outlook, bcp47]);

  if (days.length < 2) return null;

  const globalBest = outlook.reduce((a, b) => (a.score <= b.score ? a : b));
  const costs = outlook.map((h) => h.windCostS);
  const lo = Math.min(...costs);
  const hi = Math.max(...costs, lo + 60);
  const tone = (c: number) => {
    const f = (c - lo) / (hi - lo);
    return f < 0.34 ? "#34d399" : f < 0.67 ? "#facc15" : "#ef4444";
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="label flex min-h-11 w-full items-center justify-between hover:text-[var(--color-muted)] md:min-h-0"
      >
        <span>{t("otherDays")}</span>
        <span className="text-[var(--color-faint)]">{open ? "−" : "+"}</span>
      </button>

      {!open && (
        <p className="mt-1 text-[0.72rem] leading-snug text-[var(--color-muted)]">
          {t.rich("bestMoment", {
            day: new Date(globalBest.departure).toLocaleDateString(bcp47, {
              weekday: "long",
              day: "numeric",
            }),
            hour: fmtHour(globalBest.departure, locale),
            duration: fmtDuration(globalBest.timeS),
            toll: Math.round(globalBest.windCostS / 60),
            b: (chunks) => (
              <span className="font-semibold text-[var(--color-ink)]">{chunks}</span>
            ),
          })}
        </p>
      )}

      {open && (
        <div className="rise mt-2 space-y-2">
          {days.map((d) => (
            <div key={d.label}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[0.72rem] font-semibold capitalize">{d.label}</span>
                <span className="num text-[0.66rem] text-[var(--color-faint)]">
                  {t("bestAt", {
                    hour: fmtHour(d.best.departure, locale),
                    toll: Math.round(d.best.windCostS / 60),
                  })}
                </span>
              </div>
              <div className="flex gap-[2px]">
                {d.hours.map((h) => {
                  const on = h.departure === selected;
                  const isBest = h.departure === globalBest.departure;
                  return (
                    <button
                      key={h.departure}
                      type="button"
                      disabled={busy}
                      onClick={() => onSelect(h.departure)}
                      title={t("hourTooltip", {
                        hour: fmtHour(h.departure, locale),
                        duration: fmtDuration(h.timeS),
                        toll: Math.round(h.windCostS / 60),
                      })}
                      className="group relative h-6 flex-1 rounded-[3px] transition-all disabled:opacity-50"
                      style={{
                        background: tone(h.windCostS),
                        opacity: on ? 1 : 0.55,
                        outline: isBest ? "1.5px solid rgba(255,255,255,.85)" : "none",
                        outlineOffset: "-1.5px",
                      }}
                    >
                      <span className="pointer-events-none absolute inset-x-0 -bottom-3 hidden text-[0.55rem] text-[var(--color-faint)] group-hover:block">
                        {new Date(h.departure).getHours()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[0.64rem] leading-snug text-[var(--color-faint)]">
            {t("legend")}
          </p>
        </div>
      )}
    </div>
  );
}
