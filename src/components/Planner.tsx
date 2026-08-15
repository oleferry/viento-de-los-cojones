"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlaceInput from "./PlaceInput";
import WindRose from "./WindRose";
import RouteProfile from "./RouteProfile";
import HourStrip from "./HourStrip";
import Outlook from "./Outlook";
import RiderSheet from "./RiderSheet";
import GroupPicker from "./GroupPicker";
import TrackImport from "./TrackImport";
import AccountBar, { useCuenta } from "./AccountBar";
import SavedRoutes from "./SavedRoutes";
import { downloadGPX } from "@/lib/gpx";
import type { ImportedTrack } from "@/lib/gpxImport";
import {
  DEFAULT_GROUP,
  DEFAULT_SETUP,
  computeCdA,
  computeCrr,
  draftMultiplier,
  intensitySanity,
  targetPower,
  totalMass,
  type GroupSetup,
  type RiderSetup,
} from "@/lib/equipment";
import {
  beaufort,
  cardinal,
  fmtDay,
  fmtDelta,
  fmtDuration,
  fmtHour,
} from "@/lib/format";
import type {
  Candidate,
  LonLat,
  PlanResponse,
  Shape,
  Surface,
  WindMode,
} from "@/lib/types";

import type { MapTheme } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#080b11]" />,
});

const SURFACES: { id: Surface; label: string; hint: string }[] = [
  { id: "carretera", label: "Carretera", hint: "asfalto, bici de ruta" },
  { id: "mixto", label: "Mixto", hint: "asfalto y pistas" },
  { id: "camino", label: "Camino", hint: "gravel y tierra" },
];

const MODES: { id: WindMode; label: string; hint: string }[] = [
  { id: "tailwind_home", label: "Volver a favor", hint: "el regalo, al final" },
  { id: "hard_first", label: "El palo primero", hint: "de cara al salir, a favor al volver" },
  { id: "min_effort", label: "Menos esfuerzo", hint: "minimiza el viento en toda la ruta" },
];

const SETUP_KEY = "vdc.rider.v1";
const GROUP_KEY = "vdc.group.v1";

function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(0)}`;
}

export default function Planner() {
  const [startText, setStartText] = useState("");
  const [start, setStart] = useState<LonLat | null>(null);
  const [endText, setEndText] = useState("");
  const [end, setEnd] = useState<LonLat | null>(null);

  const [shape, setShape] = useState<Shape>("circular");
  const [distanceKm, setDistanceKm] = useState(60);
  const [surface, setSurface] = useState<Surface>("carretera");
  const [windMode, setWindMode] = useState<WindMode>("tailwind_home");
  const [setup, setSetup] = useState<RiderSetup>(DEFAULT_SETUP);
  const [group, setGroup] = useState<GroupSetup>(DEFAULT_GROUP);
  const [track, setTrack] = useState<ImportedTrack | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [departure, setDeparture] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return localInputValue(d);
  });
  const [flexHours, setFlexHours] = useState(3);

  const [picking, setPicking] = useState<null | "start" | "end">(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const [showArrows, setShowArrows] = useState(true);
  const [showAlts, setShowAlts] = useState(true);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  const [sheetOpen, setSheetOpen] = useState(false);
  const inflight = useRef<AbortController | null>(null);
  const { cuenta, recargar } = useCuenta();
  const conSesion = !!cuenta?.user;
  const [guardando, setGuardando] = useState<"no" | "si" | "hecho">("no");

  // --- perfil persistido ---------------------------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETUP_KEY);
      if (raw) setSetup({ ...DEFAULT_SETUP, ...JSON.parse(raw) });
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [setup]);

  /**
   * Con sesion, la cuenta manda sobre lo guardado en el navegador: es lo que
   * hace que el perfil sea el mismo en el movil y en el ordenador. El
   * localStorage se queda como respaldo para quien no entra.
   */
  const perfilCargado = useRef(false);
  useEffect(() => {
    if (!cuenta?.profile || perfilCargado.current) return;
    perfilCargado.current = true;
    const p = cuenta.profile;
    const bici = cuenta.bikes?.find((b) => b.isDefault) ?? cuenta.bikes?.[0];
    setSetup((prev) => ({
      ...prev,
      heightCm: p.heightCm,
      massKg: p.massKg,
      ftpW: p.ftpW,
      intensity: p.intensity,
      position: p.position,
      ...(bici
        ? {
            frame: bici.frame,
            wheels: bici.wheels,
            tyres: bici.tyres,
            clothing: bici.clothing,
            helmet: bici.helmet,
            luggage: bici.luggage,
            bikeKg: bici.bikeKg,
            extraKg: bici.extraKg,
          }
        : {}),
    }));
  }, [cuenta]);

  // Y al reves: los cambios del perfil suben a la cuenta, con retardo para no
  // mandar una peticion por cada tecla del FTP.
  useEffect(() => {
    if (!conSesion || !perfilCargado.current) return;
    const t = setTimeout(() => {
      fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heightCm: setup.heightCm,
          massKg: setup.massKg,
          ftpW: setup.ftpW,
          intensity: setup.intensity,
          position: setup.position,
        }),
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [setup, conSesion]);

  // El grupo se recuerda aparte del perfil: cambia de una salida a otra.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUP_KEY);
      if (raw) setGroup({ ...DEFAULT_GROUP, ...JSON.parse(raw) });
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_KEY, JSON.stringify(group));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [group]);

  /** Lo que el motor necesita, derivado del perfil y del firme elegido. */
  const riderPayload = useMemo(
    () => ({
      powerW: targetPower(setup),
      massKg: totalMass(setup),
      cda: computeCdA(setup).total,
      crr: computeCrr(setup, surface),
      drivetrain: 0.975,
      draftMultiplier: draftMultiplier(group.groupSize),
      draftFraction: group.groupSize > 1 ? group.draftFraction : 0,
    }),
    [setup, surface, group]
  );

  // --- estado en la URL, para poder compartir un plan --------------------
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("s")?.split(",").map(Number);
    if (s?.length === 2 && s.every(Number.isFinite)) {
      setStart([s[0], s[1]]);
      setStartText(q.get("sn") ?? `${s[1].toFixed(4)}, ${s[0].toFixed(4)}`);
    }
    const e = q.get("e")?.split(",").map(Number);
    if (e?.length === 2 && e.every(Number.isFinite)) {
      setEnd([e[0], e[1]]);
      setEndText(q.get("en") ?? `${e[1].toFixed(4)}, ${e[0].toFixed(4)}`);
    }
    if (q.get("shape") === "lineal") setShape("lineal");
    const d = Number(q.get("d"));
    if (Number.isFinite(d) && d >= 5 && d <= 400) setDistanceKm(d);
    const sf = q.get("sf") as Surface | null;
    if (sf && SURFACES.some((x) => x.id === sf)) setSurface(sf);
    const wm = q.get("m") as WindMode | null;
    if (wm && MODES.some((x) => x.id === wm)) setWindMode(wm);
  }, []);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !start) return "";
    const q = new URLSearchParams({
      s: `${start[0]},${start[1]}`,
      sn: startText,
      shape,
      d: String(distanceKm),
      sf: surface,
      m: windMode,
    });
    if (shape === "lineal" && end) {
      q.set("e", `${end[0]},${end[1]}`);
      q.set("en", endText);
    }
    return `${window.location.origin}${window.location.pathname}?${q}`;
  }, [start, startText, end, endText, shape, distanceKm, surface, windMode]);

  const candidates = useMemo(
    () => (result ? [result.best, ...result.alternatives] : []),
    [result]
  );
  const shown: Candidate | null =
    candidates.find((c) => c.id === chosenId) ?? result?.best ?? null;

  const canPlan =
    shape === "importada"
      ? !!track
      : !!start && (shape === "circular" || !!end);

  const run = useCallback(
    async (overrideDepartureMs?: number) => {
      if (shape === "importada" ? !track : !start) return;
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      setBusy(true);
      setError(null);
      try {
        // Una ruta importada no hay que trazarla: solo se simula, asi que va a
        // otro endpoint que no gasta ni una peticion de enrutado.
        const importada = shape === "importada" && track;
        const res = await fetch(importada ? "/api/analyze" : "/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify(
            importada
              ? {
                  coords: track.coords,
                  name: track.name,
                  departureMs: overrideDepartureMs ?? new Date(departure).getTime(),
                  flexHours: overrideDepartureMs != null ? 0 : flexHours,
                  tzOffsetMinutes: -new Date().getTimezoneOffset(),
                  rider: riderPayload,
                }
              : {
                  start,
                  end: shape === "lineal" ? end : undefined,
                  shape,
                  distanceKm,
                  surface,
                  windMode,
                  departureMs: overrideDepartureMs ?? new Date(departure).getTime(),
                  flexHours: overrideDepartureMs != null ? 0 : flexHours,
                  tzOffsetMinutes: -new Date().getTimezoneOffset(),
                  rider: riderPayload,
                }
          ),
        });
        // Nunca `res.json()` a pelo: cuando la plataforma corta la funcion
        // devuelve texto plano ("An error occurred with your deployment...") y
        // el parseo revienta con un mensaje que no dice nada del problema real.
        const raw = await res.text();
        let data: PlanResponse & { error?: string };
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            res.status === 504 || /TIMEOUT/i.test(raw)
              ? "El servidor ha tardado demasiado en responder. Prueba con menos distancia o menos margen de horas."
              : `El servidor respondió algo inesperado (${res.status}). Inténtalo de nuevo en un momento.`
          );
        }
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setResult((prev) =>
          overrideDepartureMs != null && prev
            ? // Al elegir una hora concreta se replanifica con margen cero, asi
              // que conservamos las franjas originales para no perder el contexto.
              { ...data, hours: prev.hours, outlook: prev.outlook }
            : data
        );
        setChosenId(null);
        setSheetOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [start, end, shape, distanceKm, surface, windMode, departure, flexHours, riderPayload, track]
  );

  const onPick = useCallback(
    (p: LonLat) => {
      const label = `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;
      if (picking === "start") {
        setStart(p);
        setStartText(label);
      } else if (picking === "end") {
        setEnd(p);
        setEndText(label);
      }
      setPicking(null);
    },
    [picking]
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const p: LonLat = [
        Number(pos.coords.longitude.toFixed(6)),
        Number(pos.coords.latitude.toFixed(6)),
      ];
      setStart(p);
      setStartText(`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`);
    });
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView
        best={shown}
        alternatives={result ? candidates.filter((c) => c.id !== shown?.id) : []}
        start={start}
        end={end}
        shape={shape}
        picking={picking}
        onPick={onPick}
        showArrows={showArrows}
        showAlternatives={showAlts}
        hoverKm={hoverKm}
        theme={mapTheme}
        windGrid={result?.wind.grid}
      />

      {/* leyenda flotante — en movil arriba, que abajo esta el panel */}
      <div className="glass pointer-events-auto absolute right-2 top-2 z-20 rounded-xl px-2.5 py-2 md:bottom-6 md:right-3 md:top-auto md:px-3">
        <div className="label mb-1.5">Viento en ruta</div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-20 rounded-full bg-gradient-to-r from-[#34d399] via-[#facc15] to-[#ef4444] md:w-24" />
        </div>
        <div className="mt-1 flex justify-between text-[0.62rem] text-[var(--color-faint)]">
          <span>a favor</span>
          <span>de cara</span>
        </div>
        <div className="mt-2 flex flex-col gap-1 text-[0.68rem]">
          <Toggle on={showArrows} onChange={setShowArrows} label="Viento" />
          <Toggle on={showAlts} onChange={setShowAlts} label="Alternativas" />
        </div>
        <div className="seg mt-2 grid-cols-2">
          <button data-on={mapTheme === "dark"} onClick={() => setMapTheme("dark")}>
            Oscuro
          </button>
          <button data-on={mapTheme === "light"} onClick={() => setMapTheme("light")}>
            Claro
          </button>
        </div>
      </div>

      {/* panel */}
      <div
        className={[
          "glass scroll-thin absolute z-30 overflow-y-auto",
          "inset-x-0 bottom-0 max-h-[86dvh] rounded-t-3xl",
          sheetOpen ? "" : "translate-y-[calc(100%-8.5rem)]",
          "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          "md:inset-y-3 md:left-3 md:right-auto md:w-[26rem] md:max-h-none md:translate-y-0 md:rounded-2xl",
        ].join(" ")}
      >
        {/* asa del bottom sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          className="sticky top-0 z-10 flex w-full justify-center py-2.5 md:hidden"
          style={{ background: "linear-gradient(180deg,rgba(20,26,38,.96),rgba(20,26,38,0))" }}
          aria-label={sheetOpen ? "Contraer panel" : "Expandir panel"}
        >
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </button>

        <div className="space-y-4 px-4 pb-6 md:px-5 md:pt-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[1.05rem] font-bold leading-tight tracking-tight">
                Viento de los cojones
              </h1>
              <p className="mt-0.5 text-[0.72rem] leading-snug text-[var(--color-faint)]">
                Rutas trazadas según sopla, hora a hora.
              </p>
            </div>
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 shrink-0 text-[0.62rem] text-[var(--color-faint)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-muted)]"
            >
              datos
            </a>
          </header>

          <AccountBar cuenta={cuenta} onRecargar={recargar} />

          <SavedRoutes
            activo={conSesion}
            onCargar={(nombre, coords) => {
              setTrack({ name: nombre, coords, hasElevation: coords[0]?.length > 2 });
              setShape("importada");
              setResult(null);
            }}
          />

          {/* --- salida / llegada --- */}
          <div className="space-y-3">
            <div className="seg grid-cols-3">
              {(["circular", "lineal", "importada"] as Shape[]).map((s) => (
                <button key={s} data-on={shape === s} onClick={() => setShape(s)}>
                  {s === "circular" ? "Circular" : s === "lineal" ? "A → B" : "Mi ruta"}
                </button>
              ))}
            </div>

            {shape === "importada" && (
              <div className="rise">
                <TrackImport track={track} onLoad={setTrack} />
              </div>
            )}

            {shape !== "importada" && (
            <PlaceInput
              label="Salida"
              placeholder="Villalón de Campos, Medina de Rioseco…"
              value={start}
              text={startText}
              onChange={(t, p) => {
                setStartText(t);
                if (p) setStart(p);
                else if (!t) setStart(null);
              }}
              onPickOnMap={() => setPicking(picking === "start" ? null : "start")}
              picking={picking === "start"}
            />
            )}
            {shape !== "importada" && (
            <button
              type="button"
              onClick={useMyLocation}
              className="-mt-1 text-[0.68rem] font-semibold text-[var(--color-faint)] transition-colors hover:text-[var(--color-accent)]"
            >
              usar mi ubicación
            </button>
            )}

            {shape === "lineal" && (
              <div className="rise">
                <PlaceInput
                  label="Llegada"
                  placeholder="¿A dónde vas?"
                  value={end}
                  text={endText}
                  onChange={(t, p) => {
                    setEndText(t);
                    if (p) setEnd(p);
                    else if (!t) setEnd(null);
                  }}
                  onPickOnMap={() => setPicking(picking === "end" ? null : "end")}
                  picking={picking === "end"}
                  accent="#4cc9f0"
                />
              </div>
            )}
          </div>

          {/* --- distancia --- */}
          {shape === "circular" && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label">Distancia</span>
                <span className="num text-sm font-bold text-[var(--color-accent)]">
                  {distanceKm} km
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={220}
                step={5}
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
              />
              <div className="mt-1.5 flex gap-1.5">
                {[40, 60, 80, 100, 130].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDistanceKm(d)}
                    className="num flex-1 rounded-lg border border-white/8 py-1 text-[0.7rem] text-[var(--color-muted)] transition-colors hover:border-white/20 hover:text-[var(--color-ink)]"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --- firme --- */}
          <div className={shape === "importada" ? "hidden" : undefined}>
            <div className="label mb-1.5">Por dónde</div>
            <div className="seg grid-cols-3">
              {SURFACES.map((s) => (
                <button
                  key={s.id}
                  data-on={surface === s.id}
                  onClick={() => setSurface(s.id)}
                  title={s.hint}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* --- estrategia de viento --- */}
          <div className={shape === "importada" ? "hidden" : undefined}>
            <div className="label mb-1.5">Qué prefieres</div>
            <div className="seg">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  data-on={windMode === m.id}
                  onClick={() => setWindMode(m.id)}
                  className="flex flex-col items-start gap-0.5 !px-2.5 !py-2 text-left"
                >
                  <span className="text-[0.82rem]">{m.label}</span>
                  <span className="text-[0.66rem] font-normal opacity-70">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* --- cuándo --- */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <div className="label mb-1.5">Salida</div>
              <input
                type="datetime-local"
                className="field num"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
            </div>
            <div>
              <div className="label mb-1.5">Margen</div>
              <select
                className="field num"
                value={flexHours}
                onChange={(e) => setFlexHours(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 6, 8, 12].map((h) => (
                  <option key={h} value={h}>
                    ±{h} h
                  </option>
                ))}
              </select>
            </div>
          </div>

          <GroupPicker group={group} onChange={setGroup} />

          {/* --- perfil de ciclista --- */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="card flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-white/20"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l4-2 3 4h3" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8rem] font-semibold">Perfil de ciclista</span>
              <span className="num block truncate text-[0.66rem] text-[var(--color-faint)]">
                {riderPayload.powerW} W · CdA {riderPayload.cda.toFixed(3)} ·{" "}
                {riderPayload.massKg.toFixed(0)} kg
              </span>
            </span>
            <span className="shrink-0 text-[var(--color-faint)]">›</span>
          </button>

          <button
            className="btn btn-primary w-full !py-2.5 !text-[0.9rem]"
            disabled={!canPlan || busy}
            onClick={() => run()}
          >
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black/70" />
                {shape === "importada" ? "Mirando el aire…" : "Buscando por dónde…"}
              </>
            ) : shape === "importada" ? (
              "Analizar mi ruta"
            ) : (
              "Trazar ruta"
            )}
          </button>

          {error && (
            <div className="rise rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.78rem] leading-snug text-red-200">
              <p>{error}</p>
              {/^(OSRM|ORS)/.test(error) && (
                <p className="mt-1.5 text-[0.72rem] text-red-200/70">
                  El servidor de rutas está saturado. Prueba otra vez en un
                  minuto, o configura una clave gratuita de{" "}
                  <a
                    href="https://openrouteservice.org/dev/#/signup"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2"
                  >
                    OpenRouteService
                  </a>{" "}
                  para tener cupo propio.
                </p>
              )}
            </div>
          )}

          {result && shown && (
            <Results
              result={result}
              shown={shown}
              candidates={candidates}
              onChoose={setChosenId}
              onHover={setHoverKm}
              onPickHour={(iso) => run(Date.parse(iso))}
              busy={busy}
              shareUrl={shareUrl}
              intensityWarning={intensitySanity(
                setup.intensity,
                shown.evaluation.timeS / 3600
              )}
              guardar={
                conSesion
                  ? {
                      estado: guardando,
                      onGuardar: async () => {
                        setGuardando("si");
                        try {
                          await fetch("/api/routes", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name:
                                shape === "importada" && track
                                  ? track.name
                                  : `${(shown.geometry.distanceM / 1000).toFixed(0)} km desde ${
                                      startText || "aquí"
                                    }`,
                              kind: shape === "importada" ? "imported" : "planned",
                              distanceM: shown.geometry.distanceM,
                              ascentM: shown.geometry.ascentM ?? null,
                              coords: shown.geometry.coords,
                              meta: { surface, windMode },
                            }),
                          });
                          setGuardando("hecho");
                          setTimeout(() => setGuardando("no"), 2200);
                        } catch {
                          setGuardando("no");
                        }
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {profileOpen && (
        <RiderSheet
          setup={setup}
          onChange={setSetup}
          surface={surface}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center gap-1.5 text-left text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
    >
      <span
        className="h-3 w-5 rounded-full p-[2px] transition-colors"
        style={{ background: on ? "var(--color-accent)" : "rgba(255,255,255,.14)" }}
      >
        <span
          className="block h-2 w-2 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(8px)" : "none" }}
        />
      </span>
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "#56d364" : tone === "bad" ? "#ff8080" : "var(--color-ink)";
  return (
    <div className="card px-2.5 py-2">
      <div className="label text-[0.6rem]">{label}</div>
      <div className="num mt-0.5 text-[1.05rem] font-bold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[0.64rem] leading-tight text-[var(--color-faint)]">{sub}</div>
      )}
    </div>
  );
}

function verdict(c: Candidate, windFromDeg: number): string {
  const out = c.evaluation.outboundTailwind;
  const home = c.evaluation.homeTailwind;
  const dir = `del ${cardinal(windFromDeg)}`;
  const salida =
    out < -1 ? "sales con el aire de cara" : out > 1 ? "sales empujado" : "sales con el aire de lado";
  const vuelta =
    home > 1.2
      ? "y vuelves con él a favor"
      : home < -1.2
        ? "y la vuelta también es de cara"
        : "y vuelves con el aire cruzado";
  return `Viento ${dir}: ${salida} ${vuelta}.`;
}

function Results({
  result,
  shown,
  candidates,
  onChoose,
  onHover,
  onPickHour,
  busy,
  shareUrl,
  intensityWarning,
  guardar,
}: {
  result: PlanResponse;
  shown: Candidate;
  candidates: Candidate[];
  onChoose: (id: string) => void;
  onHover: (km: number | null) => void;
  onPickHour: (iso: string) => void;
  busy: boolean;
  shareUrl: string;
  intensityWarning: string | null;
  /** Solo con sesion: guardar la ruta en la cuenta. */
  guardar?: { estado: "no" | "si" | "hecho"; onGuardar: () => void };
}) {
  const [copied, setCopied] = useState(false);
  const ev = shown.evaluation;
  const w = result.wind.atStart;
  const bf = beaufort(w.speed10);
  const km = shown.geometry.distanceM / 1000;

  return (
    <div className="rise space-y-3.5 border-t border-white/8 pt-4">
      <div className="flex items-start gap-3">
        <WindRose
          fromDeg={w.fromDeg}
          speed={w.speed10}
          headingDeg={shown.headingDeg}
          size={116}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[0.68rem] uppercase tracking-wider text-[var(--color-faint)]">
            {fmtDay(shown.departure)} · {fmtHour(shown.departure)}
          </div>
          <div className="mt-0.5 text-[0.82rem] font-semibold leading-snug">
            Viento del {cardinal(w.fromDeg)} · {(w.speed10 * 3.6).toFixed(0)} km/h
          </div>
          <div className="text-[0.7rem] text-[var(--color-faint)]">
            rachas {(w.gust * 3.6).toFixed(0)} km/h · {bf.name} (fuerza {bf.n})
          </div>
          <p className="mt-2 text-[0.76rem] leading-snug text-[var(--color-muted)]">
            {verdict(shown, w.fromDeg)}
          </p>
        </div>
      </div>

      {intensityWarning && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[0.74rem] leading-snug text-amber-200/90">
          {intensityWarning}
        </p>
      )}

      {(result.wind.worst.gust * 3.6 > 55 || result.wind.worst.precipProb > 40) && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[0.74rem] leading-snug text-amber-200/90">
          {result.wind.worst.gust * 3.6 > 55 &&
            `Rachas de hasta ${(result.wind.worst.gust * 3.6).toFixed(0)} km/h durante la ruta. `}
          {result.wind.worst.precipProb > 40 &&
            `Hasta un ${Math.round(result.wind.worst.precipProb)}% de probabilidad de lluvia por el camino.`}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Distancia" value={`${km.toFixed(1)} km`}
          sub={shown.geometry.ascentM != null ? `+${Math.round(shown.geometry.ascentM)} m` : undefined} />
        <Stat label="Tiempo" value={fmtDuration(ev.timeS)} sub={`${ev.avgKmh.toFixed(1)} km/h`} />
        <Stat
          label="Peaje del aire"
          value={fmtDelta(ev.windCostS)}
          sub="frente a calma"
          tone={ev.windCostS > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="A favor" value={`${Math.round(ev.tailwindFrac * 100)}%`} tone="good" />
        <Stat label="De cara" value={`${Math.round(ev.headwindFrac * 100)}%`} tone="bad" />
        <Stat
          label="Últimos km"
          value={`${(ev.homeTailwind * 3.6).toFixed(0)}`}
          sub={ev.homeTailwind >= 0 ? "km/h a favor" : "km/h en contra"}
          tone={ev.homeTailwind >= 0 ? "good" : "bad"}
        />
      </div>

      {shown.geometry.unpavedFrac != null && (
        <div className="card px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="label">Firme</span>
            <span className="num text-[0.75rem] text-[var(--color-muted)]">
              {shown.geometry.unpavedFrac < 0.005
                ? "todo asfalto"
                : `${(shown.geometry.unpavedFrac * 100).toFixed(
                    shown.geometry.unpavedFrac < 0.1 ? 1 : 0
                  )}% sin asfaltar`}
            </span>
          </div>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#4cc9f0] to-[#a78bfa]"
              style={{ width: `${(1 - shown.geometry.unpavedFrac) * 100}%` }}
            />
            <div
              className="h-full bg-[#b45309]"
              style={{ width: `${shown.geometry.unpavedFrac * 100}%` }}
            />
          </div>
          {shown.geometry.unpavedFrac >= 0.005 && (
            <p className="mt-1.5 text-[0.64rem] leading-snug text-[var(--color-faint)]">
              {(
                (shown.geometry.unpavedFrac * shown.geometry.distanceM) /
                1000
              ).toFixed(1)}{" "}
              km de camino confirmado. El resto es asfalto o vía sin etiquetar
              en OpenStreetMap.
            </p>
          )}
        </div>
      )}

      <RouteProfile track={shown.track} onHover={onHover} />

      <HourStrip
        hours={result.hours}
        selected={shown.departure}
        onSelect={onPickHour}
        busy={busy}
      />

      <Outlook
        outlook={result.outlook ?? []}
        selected={shown.departure}
        onSelect={onPickHour}
        busy={busy}
      />

      {candidates.length > 1 && (
        <div>
          <div className="label mb-1.5">Otras opciones</div>
          <div className="space-y-1.5">
            {candidates.map((c) => {
              const on = c.id === shown.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onChoose(c.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all"
                  style={{
                    borderColor: on ? "rgba(255,138,61,.45)" : "var(--color-line)",
                    background: on ? "rgba(255,138,61,.1)" : "rgba(255,255,255,.02)",
                  }}
                >
                  {c.headingDeg != null && (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-[0.6rem] font-bold"
                      style={{ color: on ? "var(--color-accent)" : "var(--color-muted)" }}
                    >
                      {cardinal(c.headingDeg)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.78rem] font-medium">
                      {c.label}
                    </span>
                    <span className="num block text-[0.66rem] text-[var(--color-faint)]">
                      {(c.geometry.distanceM / 1000).toFixed(1)} km ·{" "}
                      {fmtDuration(c.evaluation.timeS)} · vuelta{" "}
                      {(c.evaluation.homeTailwind * 3.6).toFixed(0)} km/h{" "}
                      {c.evaluation.homeTailwind >= 0 ? "a favor" : "en contra"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="btn flex-1"
          onClick={() =>
            downloadGPX(
              shown,
              `viento-${km.toFixed(0)}km-${fmtHour(shown.departure).replace(":", "")}`
            )
          }
        >
          Descargar GPX
        </button>
        <button
          className="btn flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* sin portapapeles */
            }
          }}
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>

      {guardar && (
        <button
          className="btn w-full"
          disabled={guardar.estado === "si"}
          onClick={guardar.onGuardar}
        >
          {guardar.estado === "si"
            ? "Guardando…"
            : guardar.estado === "hecho"
              ? "Guardada en tu cuenta"
              : "Guardar ruta"}
        </button>
      )}

      <details className="text-[0.68rem] text-[var(--color-faint)]">
        <summary className="cursor-pointer select-none hover:text-[var(--color-muted)]">
          Cómo se ha calculado
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            Se han trazado {result.meta.routingCalls} rutas candidatas con{" "}
            {result.meta.profile} y se ha simulado cada una tramo a tramo,
            consultando la previsión en el instante en el que pasarías por cada
            punto (no la de la salida).
          </p>
          <p>
            El viento a 10 m se reduce a la altura del ciclista y se descompone en
            componente frontal y lateral; la velocidad sale de resolver el balance
            de potencia ({result.meta.rider.powerW} W, CdA{" "}
            {result.meta.rider.cda.toFixed(3)}, Crr{" "}
            {result.meta.rider.crr.toFixed(4)}, {result.meta.rider.massKg.toFixed(1)} kg).
          </p>
          <p>
            Densidad del aire media en ruta{" "}
            <span className="num">{ev.meanRho.toFixed(3)} kg/m³</span> (
            {result.wind.atStart.tempC.toFixed(0)} °C,{" "}
            {result.wind.atStart.pressure.toFixed(0)} hPa,{" "}
            {result.wind.atStart.humidity.toFixed(0)}% de humedad). Frente a los
            1,225 estándar a nivel del mar, aquí el aire pesa un{" "}
            {Math.abs(Math.round((1 - ev.meanRho / 1.225) * 100))}%{" "}
            {ev.meanRho < 1.225 ? "menos" : "más"}.
          </p>
          {(result.meta.rider.draftFraction ?? 0) > 0 && (
            <p>
              Rebufo: vas tapado el{" "}
              {Math.round((result.meta.rider.draftFraction ?? 0) * 100)}% del tiempo con
              un ahorro del{" "}
              {Math.round((1 - (result.meta.rider.draftMultiplier ?? 1)) * 100)}%, y el
              beneficio se degrada tramo a tramo según lo angulado que entre el aire.
            </p>
          )}
          {result.meta.warnings.map((w, i) => (
            <p key={i} className="text-amber-300/70">
              {w}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}
