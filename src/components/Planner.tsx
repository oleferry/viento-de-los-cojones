"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
import InstalarApp from "./PWA";
import LocaleSwitch from "./LocaleSwitch";
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
  // Del mismo color que el mapa claro, que es con el que arranca: con el negro
  // de antes se veia un parpadeo oscuro antes de aparecer el mapa.
  loading: () => <div className="absolute inset-0 bg-[#eef1f5]" />,
});

const SURFACES: Surface[] = ["carretera", "mixto", "camino"];
const MODES: WindMode[] = ["tailwind_home", "hard_first", "min_effort"];

const SETUP_KEY = "vdc.rider.v1";
const GROUP_KEY = "vdc.group.v1";

function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(0)}`;
}

export default function Planner({
  initialTrack,
  initialSurface,
  initialWindMode,
}: {
  /** Ruta con la que arrancar ya cargada: la usa la pagina de un enlace compartido. */
  initialTrack?: ImportedTrack;
  initialSurface?: Surface;
  initialWindMode?: WindMode;
} = {}) {
  const t = useTranslations("Planner");
  const locale = useLocale();
  const [startText, setStartText] = useState("");
  const [start, setStart] = useState<LonLat | null>(null);
  const [endText, setEndText] = useState("");
  const [end, setEnd] = useState<LonLat | null>(null);

  const [shape, setShape] = useState<Shape>(initialTrack ? "importada" : "circular");
  const [distanceKm, setDistanceKm] = useState(60);
  const [surface, setSurface] = useState<Surface>(initialSurface ?? "carretera");
  const [windMode, setWindMode] = useState<WindMode>(initialWindMode ?? "tailwind_home");
  const [setup, setSetup] = useState<RiderSetup>(DEFAULT_SETUP);
  const [group, setGroup] = useState<GroupSetup>(DEFAULT_GROUP);
  const [track, setTrack] = useState<ImportedTrack | null>(initialTrack ?? null);
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
  /*
   * El mapa arranca en CLARO. El panel sigue siendo oscuro, pero el mapa es
   * para leerlo: voyager dibuja las comarcales y los caminos con mucho mas
   * contraste que dark_all, y la ruta va coloreada por viento sobre el, asi
   * que el fondo claro deja que el verde y el rojo se distingan. En oscuro
   * compiten con el fondo.
   */
  const [mapTheme, setMapTheme] = useState<MapTheme>("light");
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * En movil el panel no cabe entero. Con resultado, se ensena el resultado y
   * los ajustes pasan a una pestana: despues de pulsar "Trazar ruta" nadie
   * quiere hacer scroll por el formulario entero para ver cuanto va a tardar.
   * En escritorio esto no aplica y se ve todo seguido.
   */
  const [movilPestana, setMovilPestana] = useState<"ajustes" | "resultado">("ajustes");
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
    if (sf && SURFACES.includes(sf)) setSurface(sf);
    const wm = q.get("m") as WindMode | null;
    if (wm && MODES.includes(wm)) setWindMode(wm);
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

  /**
   * Clase para lo que solo se ve en la pestana de ajustes. En escritorio no
   * hay pestanas, asi que `md:block` lo devuelve siempre a la vista.
   */
  const ocultaEnMovil =
    result && movilPestana === "resultado" ? "hidden md:block" : "";

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
                  locale,
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
                  locale,
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
        setMovilPestana("resultado");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [start, end, shape, distanceKm, surface, windMode, departure, flexHours, riderPayload, track, locale]
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

      {/*
        Controles del mapa. En movil es una barra estrecha arriba a la izquierda
        (la derecha la ocupan el zoom y la ubicacion) y va por DEBAJO del panel
        en z-index: antes se solapaban y no se podia tocar ninguno de los dos.
        En escritorio se despliega la leyenda completa abajo a la derecha.
      */}
      <div className="glass absolute left-2 top-2 z-10 rounded-xl p-1.5 md:bottom-6 md:left-auto md:right-3 md:top-auto md:px-3 md:py-2">
        <div className="label mb-1.5 hidden md:block">{t("windOnRoute")}</div>
        <div className="hidden md:block">
          <span className="block h-1.5 w-24 rounded-full bg-gradient-to-r from-[#34d399] via-[#facc15] to-[#ef4444]" />
          <div className="mt-1 flex justify-between text-[0.62rem] text-[var(--color-faint)]">
            <span>{t("legendTail")}</span>
            <span>{t("legendHead")}</span>
          </div>
        </div>

        {/* Movil: iconos cuadrados de 40 px, que es lo minimo tocable. */}
        <div className="flex gap-1 md:hidden">
          <IconToggle
            on={showArrows}
            onClick={() => setShowArrows((v) => !v)}
            label={t("windArrows")}
          >
            <path d="M12 3 7 21l5-4 5 4-5-18Z" />
          </IconToggle>
          <IconToggle
            on={showAlts}
            onClick={() => setShowAlts((v) => !v)}
            label={t("altRoutes")}
          >
            <path d="M4 20 20 4M4 12h6M14 20h6" strokeDasharray="3 3" />
          </IconToggle>
          <IconToggle
            on={mapTheme === "light"}
            onClick={() => setMapTheme(mapTheme === "light" ? "dark" : "light")}
            label={t("toggleTheme")}
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </IconToggle>
        </div>

        <div className="mt-2 hidden flex-col gap-1 text-[0.68rem] md:flex">
          <Toggle on={showArrows} onChange={setShowArrows} label={t("wind")} />
          <Toggle on={showAlts} onChange={setShowAlts} label={t("alternatives")} />
        </div>
        {/*
          El envoltorio no es decorativo: `.seg` declara `display: grid` y en la
          hoja va DESPUES de las utilidades de Tailwind, asi que con la misma
          especificidad le gana a `hidden` y estos botones seguian ocupando
          sitio en movil. Ocultando el contenedor no hay pelea posible.
        */}
        <div className="hidden md:block">
          <div className="seg mt-2 grid-cols-2">
            <button data-on={mapTheme === "dark"} onClick={() => setMapTheme("dark")}>
              {t("dark")}
            </button>
            <button data-on={mapTheme === "light"} onClick={() => setMapTheme("light")}>
              {t("light")}
            </button>
          </div>
        </div>
      </div>

      {/* panel */}
      <div
        className={[
          "glass scroll-thin absolute z-30 overflow-y-auto overscroll-contain",
          // Asomado deja ver algo mas de la mitad del mapa; abierto ocupa el
          // 80%, nunca todo: perder el mapa de vista desorienta.
          "inset-x-0 bottom-0 max-h-[80dvh] rounded-t-2xl",
          sheetOpen ? "" : "translate-y-[calc(100%-7rem)]",
          "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          "md:inset-y-3 md:left-3 md:right-auto md:w-[26rem] md:max-h-none md:translate-y-0 md:rounded-2xl",
        ].join(" ")}
        style={{
          // Barra de gestos del iPhone y equivalentes en Android.
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* asa del bottom sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          className="sticky top-0 z-10 flex min-h-11 w-full items-center justify-center md:hidden"
          style={{ background: "linear-gradient(180deg,rgba(20,26,38,.97),rgba(20,26,38,0))" }}
          aria-label={sheetOpen ? t("collapsePanel") : t("expandPanel")}
          aria-expanded={sheetOpen}
        >
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </button>

        <div className="space-y-4 px-4 pb-6 md:px-5 md:pt-5">
          {/*
            Con resultado en movil la cabecera se encoge: la pantalla es corta y
            el nombre de la app no aporta nada frente a saber cuanto vas a tardar.
          */}
          <header className="flex items-start justify-between gap-3">
            <div>
              <h1
                className={`font-bold leading-tight tracking-tight ${
                  result ? "text-[0.9rem] md:text-[1.05rem]" : "text-[1.05rem]"
                }`}
              >
                Ondivento
              </h1>
              <p
                className={`mt-0.5 text-[0.72rem] leading-snug text-[var(--color-faint)] ${
                  result ? "hidden md:block" : ""
                }`}
              >
                {t("tagline")}
              </p>
            </div>
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-[0.66rem] text-[var(--color-faint)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-muted)] md:mr-0 md:min-h-0 md:px-0"
            >
              {t("data")}
            </a>
          </header>

          {/* Pestanas: solo en movil y solo cuando hay algo que ensenar. */}
          {result && (
            <div className="md:hidden">
              <div className="seg grid-cols-2">
                <button
                  data-on={movilPestana === "ajustes"}
                  onClick={() => setMovilPestana("ajustes")}
                >
                  {t("tabSettings")}
                </button>
                <button
                  data-on={movilPestana === "resultado"}
                  onClick={() => setMovilPestana("resultado")}
                >
                  {t("tabResult")}
                </button>
              </div>
            </div>
          )}

          <div className={ocultaEnMovil}>
          <AccountBar cuenta={cuenta} onRecargar={recargar} />
          </div>

          <SavedRoutes
            activo={conSesion}
            onCargar={(nombre, coords) => {
              setTrack({ name: nombre, coords, hasElevation: coords[0]?.length > 2 });
              setShape("importada");
              setResult(null);
            }}
          />

          {/* --- salida / llegada --- */}
          <div className={`space-y-3 ${ocultaEnMovil}`}>
            <div className="seg grid-cols-3">
              {(["circular", "lineal", "importada"] as Shape[]).map((s) => (
                <button key={s} data-on={shape === s} onClick={() => setShape(s)}>
                  {s === "circular"
                    ? t("shapeLoop")
                    : s === "lineal"
                      ? "A → B"
                      : t("shapeMine")}
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
              label={t("startLabel")}
              placeholder={t("startPlaceholder")}
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
              className="-mt-1 inline-flex min-h-11 items-center text-[0.72rem] font-semibold text-[var(--color-faint)] transition-colors hover:text-[var(--color-accent)] md:min-h-0"
            >
              {t("useMyLocation")}
            </button>
            )}

            {shape === "lineal" && (
              <div className="rise">
                <PlaceInput
                  label={t("endLabel")}
                  placeholder={t("endPlaceholder")}
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
            <div className={ocultaEnMovil}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label">{t("distance")}</span>
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
                    className="num min-h-11 flex-1 rounded-lg border border-white/8 text-[0.75rem] text-[var(--color-muted)] transition-colors hover:border-white/20 hover:text-[var(--color-ink)] md:min-h-0 md:py-1"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --- firme --- */}
          <div className={shape === "importada" ? "hidden" : ocultaEnMovil}>
            <div className="label mb-1.5">{t("whereLabel")}</div>
            <div className="seg grid-cols-3">
              {SURFACES.map((s) => (
                <button
                  key={s}
                  data-on={surface === s}
                  onClick={() => setSurface(s)}
                  title={t(`surface.${s}.hint`)}
                >
                  {t(`surface.${s}.label`)}
                </button>
              ))}
            </div>
          </div>

          {/* --- estrategia de viento --- */}
          <div className={shape === "importada" ? "hidden" : ocultaEnMovil}>
            <div className="label mb-1.5">{t("preferLabel")}</div>
            <div className="seg">
              {MODES.map((m) => (
                <button
                  key={m}
                  data-on={windMode === m}
                  onClick={() => setWindMode(m)}
                  className="flex flex-col items-start gap-0.5 !px-2.5 !py-2 text-left"
                >
                  <span className="text-[0.82rem]">{t(`mode.${m}.label`)}</span>
                  <span className="text-[0.66rem] font-normal opacity-70">
                    {t(`mode.${m}.hint`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* --- cuándo --- */}
          <div className={`grid grid-cols-[1fr_auto] gap-2 ${ocultaEnMovil}`}>
            <div>
              <div className="label mb-1.5">{t("departure")}</div>
              <input
                type="datetime-local"
                className="field num"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
            </div>
            <div>
              <div className="label mb-1.5">{t("flex")}</div>
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

          <div className={ocultaEnMovil}>
            <GroupPicker group={group} onChange={setGroup} />
          </div>

          {/* --- perfil de ciclista --- */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className={`card flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-white/20 ${ocultaEnMovil}`}
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
              <span className="block text-[0.8rem] font-semibold">{t("riderProfile")}</span>
              <span className="num block truncate text-[0.66rem] text-[var(--color-faint)]">
                {riderPayload.powerW} W · CdA {riderPayload.cda.toFixed(3)} ·{" "}
                {riderPayload.massKg.toFixed(0)} kg
              </span>
            </span>
            <span className="shrink-0 text-[var(--color-faint)]">›</span>
          </button>

          {/* Envuelto por lo mismo que la barra de modos: `.btn` declara
              display en la hoja despues de Tailwind y le gana a `hidden`. */}
          <div className={ocultaEnMovil}>
          <button
            className="btn btn-primary w-full !py-2.5 !text-[0.9rem]"
            disabled={!canPlan || busy}
            onClick={() => run()}
          >
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black/70" />
                {shape === "importada" ? t("busyAnalyzing") : t("busyPlanning")}
              </>
            ) : shape === "importada" ? (
              t("analyzeMyRoute")
            ) : (
              t("planRoute")
            )}
          </button>
          </div>

          <div className={ocultaEnMovil}>
            <InstalarApp />
          </div>

          {error && (
            <div className="rise rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.78rem] leading-snug text-red-200">
              <p>{error}</p>
              {/^(OSRM|ORS)/.test(error) && (
                <p className="mt-1.5 text-[0.72rem] text-red-200/70">
                  {t.rich("routerBusy", {
                    a: (chunks) => (
                      <a
                        href="https://openrouteservice.org/dev/#/signup"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-2"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
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
              onCompartir={async () => {
                const nombre =
                  shape === "importada" && track
                    ? track.name
                    : t("savedRouteName", {
                        km: (shown.geometry.distanceM / 1000).toFixed(0),
                        from: startText || t("here"),
                      });
                try {
                  const res = await fetch("/api/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: nombre,
                      coords: shown.geometry.coords,
                      distanceM: shown.geometry.distanceM,
                      ascentM: shown.geometry.ascentM ?? null,
                      surface,
                      windMode,
                      locale,
                    }),
                  });
                  const d = await res.json();
                  if (d.id) return `${window.location.origin}/${locale}/r/${d.id}`;
                } catch {
                  /* se cae al enlace de parametros */
                }
                // Sin base de datos no hay ruta que publicar, pero el enlace de
                // siempre sigue sirviendo: lleva la busqueda, no el trazado.
                return shareUrl;
              }}
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
                                  : t("savedRouteName", {
                                      km: (shown.geometry.distanceM / 1000).toFixed(0),
                                      from: startText || t("here"),
                                    }),
                              kind: shape === "importada" ? "imported" : "planned",
                              distanceM: shown.geometry.distanceM,
                              ascentM: shown.geometry.ascentM ?? null,
                              coords: shown.geometry.coords,
                              surface,
                              windMode,
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

          <div className={`flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[0.66rem] text-[var(--color-faint)] ${ocultaEnMovil}`}>
            <Link href="/como-funciona" className="hover:text-[var(--color-muted)]">
              {t("howItWorks")}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacidad" className="hover:text-[var(--color-muted)]">
              {t("privacy")}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terminos" className="hover:text-[var(--color-muted)]">
              {t("terms")}
            </Link>
            <span aria-hidden>·</span>
            <LocaleSwitch />
          </div>
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

/** Boton cuadrado de 40 px: el minimo que se toca bien con el dedo. */
function IconToggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className="grid h-10 w-10 place-items-center rounded-lg border transition-colors"
      style={{
        borderColor: on ? "rgba(255,138,61,.5)" : "var(--color-line)",
        background: on ? "rgba(255,138,61,.16)" : "rgba(255,255,255,.03)",
        color: on ? "var(--color-accent)" : "var(--color-faint)",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

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

/** Que le espera hoy, en dos mitades: como sale y como vuelve. */
function verdictKeys(c: Candidate): { out: string; home: string } {
  const out = c.evaluation.outboundTailwind;
  const home = c.evaluation.homeTailwind;
  return {
    out: out < -1 ? "outHead" : out > 1 ? "outTail" : "outCross",
    home: home > 1.2 ? "homeTail" : home < -1.2 ? "homeHead" : "homeCross",
  };
}

function Results({
  result,
  shown,
  candidates,
  onChoose,
  onHover,
  onPickHour,
  busy,
  onCompartir,
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
  /** Devuelve el enlace a copiar. Publica la ruta; si no puede, cae al de parametros. */
  onCompartir: () => Promise<string>;
  intensityWarning: ReturnType<typeof intensitySanity>;
  /** Solo con sesion: guardar la ruta en la cuenta. */
  guardar?: { estado: "no" | "si" | "hecho"; onGuardar: () => void };
}) {
  const [compartiendo, setCompartiendo] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("Planner");
  const tWind = useTranslations("Wind");
  const locale = useLocale();
  const ev = shown.evaluation;
  const w = result.wind.atStart;
  const bf = beaufort(w.speed10);
  const km = shown.geometry.distanceM / 1000;
  const vk = verdictKeys(shown);

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
            {fmtDay(shown.departure, locale)} · {fmtHour(shown.departure, locale)}
          </div>
          <div className="mt-0.5 text-[0.82rem] font-semibold leading-snug">
            {t("windFrom", {
              dir: cardinal(w.fromDeg, locale),
              kmh: (w.speed10 * 3.6).toFixed(0),
            })}
          </div>
          <div className="text-[0.7rem] text-[var(--color-faint)]">
            {t("gusts", {
              kmh: (w.gust * 3.6).toFixed(0),
              name: tWind(bf.key),
              force: bf.n,
            })}
          </div>
          <p className="mt-2 text-[0.76rem] leading-snug text-[var(--color-muted)]">
            {t("verdict", {
              dir: cardinal(w.fromDeg, locale),
              out: t(`verdictOut.${vk.out}`),
              home: t(`verdictHome.${vk.home}`),
            })}
          </p>
        </div>
      </div>

      {intensityWarning && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[0.74rem] leading-snug text-amber-200/90">
          {t("intensityWarning", intensityWarning)}
        </p>
      )}

      {(result.wind.worst.gust * 3.6 > 55 || result.wind.worst.precipProb > 40) && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[0.74rem] leading-snug text-amber-200/90">
          {result.wind.worst.gust * 3.6 > 55 &&
            t("warnGusts", { kmh: (result.wind.worst.gust * 3.6).toFixed(0) }) + " "}
          {result.wind.worst.precipProb > 40 &&
            t("warnRain", { pct: Math.round(result.wind.worst.precipProb) })}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("statDistance")} value={`${km.toFixed(1)} km`}
          sub={shown.geometry.ascentM != null ? `+${Math.round(shown.geometry.ascentM)} m` : undefined} />
        <Stat label={t("statTime")} value={fmtDuration(ev.timeS)} sub={`${ev.avgKmh.toFixed(1)} km/h`} />
        <Stat
          label={t("statToll")}
          value={fmtDelta(ev.windCostS)}
          sub={t("vsCalm")}
          tone={ev.windCostS > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("statTailwind")} value={`${Math.round(ev.tailwindFrac * 100)}%`} tone="good" />
        <Stat label={t("statHeadwind")} value={`${Math.round(ev.headwindFrac * 100)}%`} tone="bad" />
        <Stat
          label={t("statLastKm")}
          value={`${(ev.homeTailwind * 3.6).toFixed(0)}`}
          sub={ev.homeTailwind >= 0 ? t("kmhTail") : t("kmhHead")}
          tone={ev.homeTailwind >= 0 ? "good" : "bad"}
        />
      </div>

      {shown.geometry.unpavedFrac != null && (
        <div className="card px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="label">{t("surfaceLabel")}</span>
            <span className="num text-[0.75rem] text-[var(--color-muted)]">
              {shown.geometry.unpavedFrac < 0.005
                ? t("allPaved")
                : t("pctUnpaved", {
                    pct: (shown.geometry.unpavedFrac * 100).toFixed(
                      shown.geometry.unpavedFrac < 0.1 ? 1 : 0
                    ),
                  })}
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
              {t("unpavedNote", {
                km: (
                  (shown.geometry.unpavedFrac * shown.geometry.distanceM) /
                  1000
                ).toFixed(1),
              })}
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
          <div className="label mb-1.5">{t("otherOptions")}</div>
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
                      {cardinal(c.headingDeg, locale)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.78rem] font-medium">
                      {c.label}
                    </span>
                    <span className="num block text-[0.66rem] text-[var(--color-faint)]">
                      {(c.geometry.distanceM / 1000).toFixed(1)} km ·{" "}
                      {fmtDuration(c.evaluation.timeS)} ·{" "}
                      {t("candidateReturn", {
                        kmh: (c.evaluation.homeTailwind * 3.6).toFixed(0),
                        dir:
                          c.evaluation.homeTailwind >= 0
                            ? tWind("tail")
                            : tWind("head"),
                      })}
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
              `ondivento-${km.toFixed(0)}km-${fmtHour(shown.departure, locale).replace(":", "")}`
            )
          }
        >
          {t("downloadGPX")}
        </button>
        <button
          className="btn flex-1"
          disabled={compartiendo}
          onClick={async () => {
            setCompartiendo(true);
            try {
              const url = await onCompartir();
              // El navegador solo abre la hoja de compartir del sistema si la
              // pide un gesto de verdad; si no hay, se copia y ya.
              if (navigator.share) {
                await navigator.share({ title: shown.label, url });
              } else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            } catch {
              /* cancelado, o sin portapapeles */
            } finally {
              setCompartiendo(false);
            }
          }}
        >
          {compartiendo ? t("sharing") : copied ? t("copied") : t("share")}
        </button>
      </div>

      {guardar && (
        <button
          className="btn w-full"
          disabled={guardar.estado === "si"}
          onClick={guardar.onGuardar}
        >
          {guardar.estado === "si"
            ? t("saving")
            : guardar.estado === "hecho"
              ? t("saved")
              : t("saveRoute")}
        </button>
      )}

      <details className="text-[0.68rem] text-[var(--color-faint)]">
        <summary className="cursor-pointer select-none hover:text-[var(--color-muted)]">
          {t("howTitle")}
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            {t("howRouting", {
              calls: result.meta.routingCalls,
              profile: result.meta.profile,
            })}
          </p>
          <p>
            {t("howPhysics", {
              w: result.meta.rider.powerW,
              cda: result.meta.rider.cda.toFixed(3),
              crr: result.meta.rider.crr.toFixed(4),
              kg: result.meta.rider.massKg.toFixed(1),
            })}
          </p>
          <p>
            {t.rich("howDensity", {
              rho: ev.meanRho.toFixed(3),
              tempC: result.wind.atStart.tempC.toFixed(0),
              hpa: result.wind.atStart.pressure.toFixed(0),
              rh: result.wind.atStart.humidity.toFixed(0),
              pct: Math.abs(Math.round((1 - ev.meanRho / 1.225) * 100)),
              cmp: ev.meanRho < 1.225 ? t("less") : t("more"),
              n: (chunks) => <span className="num">{chunks}</span>,
            })}
          </p>
          {(result.meta.rider.draftFraction ?? 0) > 0 && (
            <p>
              {t("howDraft", {
                frac: Math.round((result.meta.rider.draftFraction ?? 0) * 100),
                saving: Math.round((1 - (result.meta.rider.draftMultiplier ?? 1)) * 100),
              })}
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
