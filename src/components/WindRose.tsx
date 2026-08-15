"use client";

import { cardinal } from "@/lib/format";

interface Props {
  /** De donde viene el viento (grados). */
  fromDeg: number;
  /** m/s a 10 m. */
  speed: number;
  /** Rumbo de salida de la ruta (grados), opcional. */
  headingDeg?: number;
  size?: number;
}

/**
 * Rosa de los vientos: la flecha grande apunta hacia donde EMPUJA el viento
 * (que es lo que le importa al ciclista), y el trazo naranja marca por dónde
 * arranca la ruta. Si los dos van a la par, sales con el aire de culo.
 */
export default function WindRose({ fromDeg, speed, headingDeg, size = 132 }: Props) {
  const c = size / 2;
  const r = c - 15;
  const toward = (fromDeg + 180) % 360;
  const kmh = speed * 3.6;

  const pt = (deg: number, rad: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  };

  const ticks = Array.from({ length: 16 }, (_, i) => i * 22.5);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Viento del ${cardinal(fromDeg)} a ${kmh.toFixed(0)} kilómetros por hora`}>
      <defs>
        <radialGradient id="rose-bg">
          <stop offset="55%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
        </radialGradient>
        <linearGradient id="rose-arrow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      <circle cx={c} cy={c} r={r + 8} fill="url(#rose-bg)" />
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <circle cx={c} cy={c} r={r * 0.6} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {ticks.map((t) => {
        const major = t % 90 === 0;
        const [x1, y1] = pt(t, r);
        const [x2, y2] = pt(t, r - (major ? 7 : 3.5));
        return (
          <line key={t} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={major ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.14)"}
            strokeWidth={major ? 1.5 : 1} />
        );
      })}

      {(["N", "E", "S", "O"] as const).map((lab, i) => {
        const [x, y] = pt(i * 90, r + 9);
        return (
          <text key={lab} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fontSize="9" fontWeight="700" fill="rgba(255,255,255,0.42)">
            {lab}
          </text>
        );
      })}

      {headingDeg != null && (
        <g transform={`rotate(${headingDeg} ${c} ${c})`}>
          <line x1={c} y1={c} x2={c} y2={c - r + 4} stroke="#ff8a3d" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="4 3" opacity="0.85" />
          <circle cx={c} cy={c - r + 4} r="3" fill="#ff8a3d" />
        </g>
      )}

      <g transform={`rotate(${toward} ${c} ${c})`}>
        <path
          d={`M ${c} ${c - r * 0.72} L ${c + r * 0.24} ${c + r * 0.34} L ${c} ${c + r * 0.14} L ${c - r * 0.24} ${c + r * 0.34} Z`}
          fill="url(#rose-arrow)"
          stroke="rgba(5,7,11,0.6)"
          strokeWidth="1"
        />
      </g>

      <circle cx={c} cy={c} r="17" fill="rgba(8,11,17,0.85)" stroke="rgba(255,255,255,0.1)" />
      <text x={c} y={c - 3} textAnchor="middle" fontSize="13" fontWeight="700" fill="#eef2f7"
        className="num">
        {kmh.toFixed(0)}
      </text>
      <text x={c} y={c + 8} textAnchor="middle" fontSize="7" fill="#93a1b3" letterSpacing="0.5">
        km/h
      </text>
    </svg>
  );
}
