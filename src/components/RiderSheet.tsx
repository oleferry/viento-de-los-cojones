"use client";

import { useMemo, useState } from "react";
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
  defaultDraftFraction,
  draftMultiplier,
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

const GROUPS = [1, 2, 3, 4, 6, 8, 15, 30];

export default function RiderSheet({ setup, onChange, surface, onClose }: Props) {
  const set = <K extends keyof RiderSetup>(key: K, value: RiderSetup[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  const cda = useMemo(() => computeCdA(setup), [setup]);
  const crr = useMemo(() => computeCrr(setup, surface), [setup, surface]);
  const power = targetPower(setup);
  const mass = totalMass(setup);
  const draftM = draftMultiplier(setup.groupSize);
  const aeroMult =
    1 - setup.draftFraction + setup.draftFraction * draftM;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="glass scroll-thin rise relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl md:max-w-3xl md:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5 backdrop-blur-xl"
          style={{ background: "linear-gradient(180deg,rgba(22,29,42,.97),rgba(20,26,38,.9))" }}>
          <div>
            <h2 className="text-[0.95rem] font-bold tracking-tight">Perfil de ciclista</h2>
            <p className="text-[0.7rem] text-[var(--color-faint)]">
              Cuanto mejor lo afines, más se parecerán los tiempos a los tuyos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn !px-2.5 !py-1.5 !text-[0.7rem]"
              onClick={() => onChange(() => ({ ...DEFAULT_SETUP }))}>
              Reiniciar
            </button>
            <button className="btn btn-primary !px-3.5 !py-1.5" onClick={onClose}>
              Listo
            </button>
          </div>
        </header>

        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          {/* ---------- cuerpo ---------- */}
          <section className="space-y-3">
            <SectionTitle>Tú</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Altura" unit="cm" value={setup.heightCm} min={130} max={215}
                onChange={(v) => set("heightCm", v)} />
              <NumberField label="Peso" unit="kg" value={setup.massKg} min={35} max={160}
                onChange={(v) => set("massKg", v)} />
              <NumberField label="Bici" unit="kg" value={setup.bikeKg} min={4} max={25} step={0.1}
                onChange={(v) => set("bikeKg", v)} />
              <NumberField label="Equipaje" unit="kg" value={setup.extraKg} min={0} max={30} step={0.5}
                onChange={(v) => set("extraKg", v)} />
            </div>
            <p className="text-[0.66rem] leading-snug text-[var(--color-faint)]">
              Con la altura y el peso se calcula tu superficie corporal (Du Bois) y de
              ahí el área que le ofreces al aire: <span className="num">{cda.bsa.toFixed(2)} m²</span> de
              superficie, <span className="num">{cda.body.toFixed(3)} m²</span> de CdA de cuerpo.
            </p>

            <Choice label="Postura habitual" items={POSITIONS} value={setup.position}
              onChange={(v) => set("position", v)} cols={4} />
          </section>

          {/* ---------- motor ---------- */}
          <section className="space-y-3">
            <SectionTitle>Motor</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="FTP" unit="W" value={setup.ftpW} min={80} max={500}
                onChange={(v) => set("ftpW", v)} />
              <div className="card px-2.5 py-2">
                <div className="label text-[0.6rem]">Potencia objetivo</div>
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
                <span className="label">Factor de intensidad</span>
                <span className="num text-sm font-bold text-[var(--color-accent)]">
                  {setup.intensity.toFixed(2)}
                </span>
              </div>
              <input type="range" min={0.45} max={1} step={0.01} value={setup.intensity}
                onChange={(e) => set("intensity", Number(e.target.value))} />
              <div className="mt-1 flex justify-between text-[0.62rem] text-[var(--color-faint)]">
                <span>paseo</span>
                <span>fondo</span>
                <span>tempo</span>
                <span>umbral</span>
              </div>
              <p className="mt-1.5 text-[0.66rem] leading-snug text-[var(--color-faint)]">
                Qué fracción de tu FTP piensas sostener de media. Para una salida larga
                lo normal es 0,65–0,75; por encima de 0,85 solo se aguanta una hora o dos.
              </p>
            </div>
          </section>

          {/* ---------- material ---------- */}
          <section className="space-y-3 md:col-span-2">
            <SectionTitle>Material</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label="Cuadro" items={FRAMES} value={setup.frame}
                onChange={(v) => set("frame", v)} />
              <Select label="Ruedas" items={WHEELS} value={setup.wheels}
                onChange={(v) => set("wheels", v)} />
              <Select label="Neumáticos" items={TYRES} value={setup.tyres}
                onChange={(v) => set("tyres", v)} />
              <Select label="Equipaje" items={LUGGAGE} value={setup.luggage}
                onChange={(v) => set("luggage", v)} />
              <Select label="Ropa" items={CLOTHING} value={setup.clothing}
                onChange={(v) => set("clothing", v)} />
              <Select label="Casco" items={HELMETS} value={setup.helmet}
                onChange={(v) => set("helmet", v)} />
            </div>
          </section>

          {/* ---------- grupo ---------- */}
          <section className="space-y-3 md:col-span-2">
            <SectionTitle>Con quién vas</SectionTitle>
            <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-start">
              <div>
                <div className="label mb-1.5">Tamaño del grupo</div>
                <div className="flex flex-wrap gap-1.5">
                  {GROUPS.map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          groupSize: n,
                          draftFraction: defaultDraftFraction(n),
                        }))
                      }
                      data-on={setup.groupSize === n}
                      className="num h-9 w-11 rounded-lg border text-[0.8rem] font-semibold transition-all"
                      style={{
                        borderColor:
                          setup.groupSize === n ? "rgba(255,138,61,.5)" : "var(--color-line)",
                        background:
                          setup.groupSize === n ? "rgba(255,138,61,.14)" : "rgba(255,255,255,.02)",
                        color:
                          setup.groupSize === n ? "var(--color-accent)" : "var(--color-muted)",
                      }}
                    >
                      {n === 1 ? "solo" : n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="label">Tiempo a rueda</span>
                  <span className="num text-sm font-bold text-[var(--color-accent)]">
                    {Math.round(setup.draftFraction * 100)}%
                  </span>
                </div>
                <input type="range" min={0} max={0.95} step={0.05}
                  value={setup.draftFraction}
                  disabled={setup.groupSize <= 1}
                  onChange={(e) => set("draftFraction", Number(e.target.value))} />
                <p className="mt-1.5 text-[0.66rem] leading-snug text-[var(--color-faint)]">
                  {setup.groupSize <= 1 ? (
                    "Yendo solo te comes todo el aire."
                  ) : (
                    <>
                      Relevando a partes iguales en un grupo de {setup.groupSize} irías tapado el{" "}
                      {Math.round(defaultDraftFraction(setup.groupSize) * 100)}% del tiempo. A rueda
                      ahorras un {Math.round((1 - draftM) * 100)}% de arrastre, así que de media
                      pagas el <span className="num">{Math.round(aeroMult * 100)}%</span> del aire.
                      El rebufo tapa menos cuanto más de lado entra el viento, y eso se aplica tramo
                      a tramo.
                    </>
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* ---------- resumen ---------- */}
          <section className="md:col-span-2">
            <div className="card p-3">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="label">Lo que sale de todo esto</span>
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

function Choice<T extends { id: string; label: string; note?: string }>({
  label, items, value, onChange, cols,
}: {
  label: string; items: T[]; value: string; onChange: (v: string) => void; cols: number;
}) {
  const active = items.find((i) => i.id === value);
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="seg" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {items.map((i) => (
          <button key={i.id} data-on={value === i.id} onClick={() => onChange(i.id)}>
            {i.label}
          </button>
        ))}
      </div>
      {active?.note && (
        <p className="mt-1 text-[0.66rem] text-[var(--color-faint)]">{active.note}</p>
      )}
    </div>
  );
}

function Select<T extends { id: string; label: string; note?: string }>({
  label, items, value, onChange,
}: {
  label: string; items: T[]; value: string; onChange: (v: string) => void;
}) {
  const active = items.find((i) => i.id === value);
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      {active?.note && (
        <p className="mt-1 line-clamp-2 text-[0.64rem] leading-snug text-[var(--color-faint)]">
          {active.note}
        </p>
      )}
    </label>
  );
}

function CdABar({ breakdown }: { breakdown: ReturnType<typeof computeCdA> }) {
  const parts = [
    { key: "Cuerpo", v: breakdown.body, c: "#ff8a3d" },
    { key: "Cuadro", v: breakdown.frame, c: "#4cc9f0" },
    { key: "Ruedas", v: breakdown.wheels, c: "#a78bfa" },
    { key: "Ropa", v: breakdown.clothing, c: "#34d399" },
    { key: "Casco", v: breakdown.helmet, c: "#facc15" },
    { key: "Equipaje", v: breakdown.luggage, c: "#f472b6" },
  ].filter((p) => p.v > 0.0005);
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.v / sum) * 100}%`, background: p.c }}
            title={`${p.key}: ${p.v.toFixed(3)} m²`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.66rem] text-[var(--color-faint)]">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.c }} />
            {p.key} <span className="num text-[var(--color-muted)]">{p.v.toFixed(3)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
