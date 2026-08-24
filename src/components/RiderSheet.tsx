"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CLOTHING,
  DEFAULT_SETUP,
  FRAMES,
  HELMETS,
  LUGGAGE,
  POSITIONS,
  TYRES,
  WHEELS,
  computeCdA,
  computeCrr,
  targetPower,
  totalMass,
  type RiderSetup,
} from "@/lib/equipment";
import type { Surface } from "@/lib/types";

interface Props {
  setup: RiderSetup;
  /**
   * Actualizador, no valor. Si cada control mandase `{...setup, campo: v}`
   * partiendo de la copia que capturo en su render, dos cambios seguidos antes
   * de repintar se pisarian y el segundo borraria al primero.
   */
  onChange: (update: (prev: RiderSetup) => RiderSetup) => void;
  surface: Surface;
  onClose: () => void;
}

export default function RiderSheet({ setup, onChange, surface, onClose }: Props) {
  const t = useTranslations("Rider");
  const tEq = useTranslations("Equipment");
  const set = <K extends keyof RiderSetup>(key: K, value: RiderSetup[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  /** Nombre y nota de una pieza del catalogo, buscados por su id. */
  const nameOf = (group: string, id: string) => tEq(`${group}.${id}.label`);
  const noteOf = (group: string, id: string) => {
    const key = `${group}.${id}.note`;
    return tEq.has(key) ? tEq(key) : undefined;
  };

  const cda = useMemo(() => computeCdA(setup), [setup]);
  const crr = useMemo(() => computeCrr(setup, surface), [setup, surface]);
  const power = targetPower(setup);
  const mass = totalMass(setup);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="glass scroll-thin rise relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl md:max-w-3xl md:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5 backdrop-blur-xl"
          style={{ background: "linear-gradient(180deg,rgba(22,29,42,.97),rgba(20,26,38,.9))" }}>
          <div>
            <h2 className="text-[0.95rem] font-bold tracking-tight">{t("title")}</h2>
            <p className="text-[0.7rem] text-[var(--color-faint)]">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn !px-2.5 !py-1.5 !text-[0.7rem]"
              onClick={() => onChange(() => ({ ...DEFAULT_SETUP }))}>
              {t("reset")}
            </button>
            <button className="btn btn-primary !px-3.5 !py-1.5" onClick={onClose}>
              {t("done")}
            </button>
          </div>
        </header>

        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          {/* ---------- cuerpo ---------- */}
          <section className="space-y-3">
            <SectionTitle>{t("you")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label={t("height")} unit="cm" value={setup.heightCm} min={130} max={215}
                onChange={(v) => set("heightCm", v)} />
              <NumberField label={t("weight")} unit="kg" value={setup.massKg} min={35} max={160}
                onChange={(v) => set("massKg", v)} />
              <NumberField label={t("bike")} unit="kg" value={setup.bikeKg} min={4} max={25} step={0.1}
                onChange={(v) => set("bikeKg", v)} />
              <NumberField label={t("luggage")} unit="kg" value={setup.extraKg} min={0} max={30} step={0.5}
                onChange={(v) => set("extraKg", v)} />
            </div>
            <p className="text-[0.66rem] leading-snug text-[var(--color-faint)]">
              {t.rich("bsaExplainer", {
                bsa: cda.bsa.toFixed(2),
                body: cda.body.toFixed(3),
                n: (chunks) => <span className="num">{chunks}</span>,
              })}
            </p>

            <Choice label={t("position")} items={POSITIONS} value={setup.position}
              onChange={(v) => set("position", v)} cols={4}
              nameOf={(id) => nameOf("positions", id)}
              noteOf={(id) => noteOf("positions", id)} />
          </section>

          {/* ---------- motor ---------- */}
          <section className="space-y-3">
            <SectionTitle>{t("engine")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="FTP" unit="W" value={setup.ftpW} min={80} max={500}
                onChange={(v) => set("ftpW", v)} />
              <div className="card px-2.5 py-2">
                <div className="label text-[0.6rem]">{t("targetPower")}</div>
                <div className="num mt-0.5 text-[1.05rem] font-bold leading-none text-[var(--color-accent)]">
                  {power} W
                </div>
                <div className="mt-1 text-[0.62rem] text-[var(--color-faint)]">
                  {(power / setup.massKg).toFixed(2)} W/kg
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label">{t("intensityFactor")}</span>
                <span className="num text-sm font-bold text-[var(--color-accent)]">
                  {setup.intensity.toFixed(2)}
                </span>
              </div>
              <input type="range" min={0.45} max={1} step={0.01} value={setup.intensity}
                onChange={(e) => set("intensity", Number(e.target.value))} />
              <div className="mt-1 flex justify-between text-[0.62rem] text-[var(--color-faint)]">
                <span>{t("ifCruise")}</span>
                <span>{t("ifEndurance")}</span>
                <span>{t("ifTempo")}</span>
                <span>{t("ifThreshold")}</span>
              </div>
              <p className="mt-1.5 text-[0.66rem] leading-snug text-[var(--color-faint)]">
                {t("intensityExplainer")}
              </p>
            </div>
          </section>

          {/* ---------- material ---------- */}
          <section className="space-y-3 md:col-span-2">
            <SectionTitle>{t("gear")}</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label={t("frame")} items={FRAMES} value={setup.frame}
                onChange={(v) => set("frame", v)}
                nameOf={(id) => nameOf("frames", id)} noteOf={(id) => noteOf("frames", id)} />
              <Select label={t("wheels")} items={WHEELS} value={setup.wheels}
                onChange={(v) => set("wheels", v)}
                nameOf={(id) => nameOf("wheels", id)} noteOf={(id) => noteOf("wheels", id)} />
              <Select label={t("tyres")} items={TYRES} value={setup.tyres}
                onChange={(v) => set("tyres", v)}
                nameOf={(id) => nameOf("tyres", id)} noteOf={(id) => noteOf("tyres", id)} />
              <Select label={t("luggage")} items={LUGGAGE} value={setup.luggage}
                onChange={(v) => set("luggage", v)}
                nameOf={(id) => nameOf("luggage", id)} noteOf={(id) => noteOf("luggage", id)} />
              <Select label={t("clothing")} items={CLOTHING} value={setup.clothing}
                onChange={(v) => set("clothing", v)}
                nameOf={(id) => nameOf("clothing", id)} noteOf={(id) => noteOf("clothing", id)} />
              <Select label={t("helmet")} items={HELMETS} value={setup.helmet}
                onChange={(v) => set("helmet", v)}
                nameOf={(id) => nameOf("helmets", id)} noteOf={(id) => noteOf("helmets", id)} />
            </div>
          </section>

          {/* ---------- resumen ---------- */}
          <section className="md:col-span-2">
            <div className="card p-3">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="label">{t("summary")}</span>
                <span className="num text-[0.72rem] text-[var(--color-faint)]">
                  CdA {cda.total.toFixed(3)} m² · Crr {crr.toFixed(4)} · {mass.toFixed(1)} kg
                </span>
              </div>
              <CdABar breakdown={cda} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.78rem] font-bold tracking-tight text-[var(--color-ink)]">
      {children}
    </h3>
  );
}

function NumberField({
  label, unit, value, min, max, step = 1, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void;
}) {
  /**
   * El campo guarda TEXTO mientras se escribe y solo se recorta al salir.
   * Recortando en cada pulsacion era imposible teclear: al borrar para poner
   * 250, el "" se convertia en 0, saltaba al minimo y machacaba el cursor, asi
   * que solo se podia usar con las flechitas.
   */
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? String(value);

  const confirmar = () => {
    const v = Number(mostrado);
    setTexto(null);
    if (Number.isFinite(v) && mostrado.trim() !== "") {
      onChange(Math.max(min, Math.min(max, v)));
    }
  };

  return (
    <label className="block">
      <span className="label mb-1.5 block">
        {label} <span className="opacity-60">({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        className="field num"
        value={mostrado}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

function Choice<T extends { id: string }>({
  label, items, value, onChange, cols, nameOf, noteOf,
}: {
  label: string; items: T[]; value: string; onChange: (v: string) => void; cols: number;
  nameOf: (id: string) => string; noteOf: (id: string) => string | undefined;
}) {
  const note = noteOf(value);
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="seg" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {items.map((i) => (
          <button key={i.id} data-on={value === i.id} onClick={() => onChange(i.id)}>
            {nameOf(i.id)}
          </button>
        ))}
      </div>
      {note && <p className="mt-1 text-[0.66rem] text-[var(--color-faint)]">{note}</p>}
    </div>
  );
}

function Select<T extends { id: string }>({
  label, items, value, onChange, nameOf, noteOf,
}: {
  label: string; items: T[]; value: string; onChange: (v: string) => void;
  nameOf: (id: string) => string; noteOf: (id: string) => string | undefined;
}) {
  const note = noteOf(value);
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {nameOf(i.id)}
          </option>
        ))}
      </select>
      {note && (
        <p className="mt-1 line-clamp-2 text-[0.64rem] leading-snug text-[var(--color-faint)]">
          {note}
        </p>
      )}
    </label>
  );
}

function CdABar({ breakdown }: { breakdown: ReturnType<typeof computeCdA> }) {
  const t = useTranslations("Rider");
  const parts = [
    { key: "body", v: breakdown.body, c: "#ff8a3d" },
    { key: "frame", v: breakdown.frame, c: "#4cc9f0" },
    { key: "wheels", v: breakdown.wheels, c: "#a78bfa" },
    { key: "clothing", v: breakdown.clothing, c: "#34d399" },
    { key: "helmet", v: breakdown.helmet, c: "#facc15" },
    { key: "luggage", v: breakdown.luggage, c: "#f472b6" },
  ].filter((p) => p.v > 0.0005);
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.v / sum) * 100}%`, background: p.c }}
            title={`${t(p.key)}: ${p.v.toFixed(3)} m²`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.66rem] text-[var(--color-faint)]">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.c }} />
            {t(p.key)} <span className="num text-[var(--color-muted)]">{p.v.toFixed(3)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
