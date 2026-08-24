"use client";

import { useTranslations } from "next-intl";
import {
  defaultDraftFraction,
  draftMultiplier,
  type GroupSetup,
} from "@/lib/equipment";

const GROUPS = [1, 2, 3, 4, 6, 8, 15, 30];

/**
 * Con quien sales hoy. Va en el formulario de la salida y no en el perfil,
 * porque la bici y las piernas son tuyas siempre pero el grupo cambia: hoy
 * sales solo y el domingo con el club.
 */
export default function GroupPicker({
  group,
  onChange,
}: {
  group: GroupSetup;
  onChange: (g: GroupSetup) => void;
}) {
  const t = useTranslations("Group");
  const m = draftMultiplier(group.groupSize);
  const aeroMult = 1 - group.draftFraction + group.draftFraction * m;

  return (
    <div>
      <div className="label mb-1.5">{t("whoWith")}</div>
      <div className="grid grid-cols-8 gap-1">
        {GROUPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() =>
              onChange({ groupSize: n, draftFraction: defaultDraftFraction(n) })
            }
            className="num h-8 rounded-lg border text-[0.72rem] font-semibold transition-all"
            style={{
              borderColor:
                group.groupSize === n ? "rgba(255,138,61,.5)" : "var(--color-line)",
              background:
                group.groupSize === n ? "rgba(255,138,61,.14)" : "rgba(255,255,255,.02)",
              color: group.groupSize === n ? "var(--color-accent)" : "var(--color-muted)",
            }}
          >
            {n === 1 ? t("alone") : n}
          </button>
        ))}
      </div>

      {group.groupSize > 1 && (
        <div className="rise mt-2">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="label">{t("timeDrafting")}</span>
            <span className="num text-[0.8rem] font-bold text-[var(--color-accent)]">
              {Math.round(group.draftFraction * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={group.draftFraction}
            onChange={(e) =>
              onChange({ ...group, draftFraction: Number(e.target.value) })
            }
          />
          <p className="mt-1 text-[0.65rem] leading-snug text-[var(--color-faint)]">
            {t("explainer", {
              even: Math.round(defaultDraftFraction(group.groupSize) * 100),
              saving: Math.round((1 - m) * 100),
              paid: Math.round(aeroMult * 100),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
