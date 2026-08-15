"use client";

import { useMemo, useRef, useState } from "react";
import type { TrackPoint } from "@/lib/types";
import { windLabel } from "@/lib/format";

interface Props {
  track: TrackPoint[];
  onHover?: (km: number | null) => void;
}

const W = 640;
const H = 132;
const PAD = { l: 30, r: 10, t: 12, b: 16 };

/**
 * Perfil de la ruta: barras de viento proyectado (rojo de cara, verde a favor)
 * sobre el relieve, más la línea de velocidad estimada. Es la vista que
 * responde de un vistazo a "¿dónde voy a sufrir?".
 */
export default function RouteProfile({ track, onHover }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<TrackPoint | null>(null);

  const model = useMemo(() => {
    if (track.length < 2) return null;
    const totalKm = track[track.length - 1].km || 1;
    const maxHw = Math.max(3, ...track.map((p) => Math.abs(p.hw)));
    const speeds = track.map((p) => p.kmh);
    const vMin = Math.min(...speeds);
    const vMax = Math.max(...speeds);
    const eles = track.map((p) => p.ele).filter((e): e is number => e != null);
    const hasEle = eles.length > track.length * 0.5;
    const eMin = hasEle ? Math.min(...eles) : 0;
    const eMax = hasEle ? Math.max(...eles) : 1;

    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (km: number) => PAD.l + (km / totalKm) * iw;
    const mid = PAD.t + ih / 2;
    const yHw = (hw: number) => mid - (hw / maxHw) * (ih / 2 - 2);
    const yV = (v: number) =>
      PAD.t + ih - ((v - vMin) / Math.max(0.1, vMax - vMin)) * (ih - 6) - 3;
    const yE = (e: number) =>
      PAD.t + ih - ((e - eMin) / Math.max(1, eMax - eMin)) * (ih * 0.55);

    const bars = track.slice(0, -1).map((p, i) => {
      const x0 = x(p.km);
      const x1 = x(track[i + 1].km);
      const y = yHw(p.hw);
      return { x: x0, w: Math.max(0.6, x1 - x0), y: Math.min(y, mid), h: Math.abs(mid - y), hw: p.hw };
    });

    const speedPath = track
      .map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${yV(p.kmh).toFixed(1)}`)
      .join(" ");

    const elePath = hasEle
      ? `M${x(0)},${PAD.t + ih} ` +
        track
          .map((p) => `L${x(p.km).toFixed(1)},${yE(p.ele ?? eMin).toFixed(1)}`)
          .join(" ") +
        ` L${x(totalKm)},${PAD.t + ih} Z`
      : null;

    return { totalKm, maxHw, mid, x, iw, ih, bars, speedPath, elePath, vMin, vMax, eMin, eMax, hasEle };
  }, [track]);

  if (!model) return null;

  const locate = (clientX: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((clientX - rect.left) / rect.width) * W;
    const km = ((rel - PAD.l) / model.iw) * model.totalKm;
    let best = track[0];
    let diff = Infinity;
    for (const p of track) {
      const d = Math.abs(p.km - km);
      if (d < diff) {
        diff = d;
        best = p;
      }
    }
    setCursor(best);
    onHover?.(best.km);
  };

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height: 132 }}
        onMouseMove={(e) => locate(e.clientX)}
        onMouseLeave={() => {
          setCursor(null);
          onHover?.(null);
        }}
        onTouchMove={(e) => locate(e.touches[0].clientX)}
        onTouchEnd={() => {
          setCursor(null);
          onHover?.(null);
        }}
      >
        <defs>
          <linearGradient id="ele-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(148,163,184,0.22)" />
            <stop offset="100%" stopColor="rgba(148,163,184,0.02)" />
          </linearGradient>
        </defs>

        {model.elePath && <path d={model.elePath} fill="url(#ele-fill)" />}

        <line x1={PAD.l} y1={model.mid} x2={W - PAD.r} y2={model.mid}
          stroke="rgba(255,255,255,0.16)" strokeWidth="1" />

        {model.bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(0.8, b.h)}
            fill={b.hw >= 0 ? "#ef4444" : "#34d399"} opacity={0.72} />
        ))}

        <path d={model.speedPath} fill="none" stroke="#facc15" strokeWidth="1.6"
          strokeLinejoin="round" opacity="0.9" />

        <text x={4} y={PAD.t + 4} fontSize="8" fill="#64748b">
          {model.maxHw.toFixed(0)} m/s
        </text>
        <text x={4} y={model.mid + 3} fontSize="8" fill="#64748b">
          0
        </text>
        <text x={4} y={H - PAD.b + 2} fontSize="8" fill="#64748b">
          −{model.maxHw.toFixed(0)}
        </text>
        <text x={W - PAD.r} y={H - 3} fontSize="8" fill="#64748b" textAnchor="end">
          {model.totalKm.toFixed(0)} km
        </text>

        {cursor && (
          <line x1={model.x(cursor.km)} y1={PAD.t - 4} x2={model.x(cursor.km)} y2={H - PAD.b}
            stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeDasharray="3 2" />
        )}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[0.7rem] text-[var(--color-faint)]">
        <div className="flex items-center gap-3">
          <Legend color="#ef4444" text="de cara" />
          <Legend color="#34d399" text="a favor" />
          <Legend color="#facc15" text="velocidad" />
          {model.hasEle && <Legend color="rgba(148,163,184,.5)" text="relieve" />}
        </div>
        {cursor && (
          <span className="num text-[var(--color-ink)]">
            km {cursor.km.toFixed(1)} · {cursor.kmh.toFixed(1)} km/h · {windLabel(cursor.yaw)}
          </span>
        )}
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-3 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}
