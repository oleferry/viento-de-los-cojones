import type { Candidate } from "./types";

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!
  );
}

/**
 * GPX 1.1 con marcas de tiempo: al llevar `<time>` en cada punto, Garmin y
 * Wahoo muestran la hora estimada de paso, que es justo lo que hace util
 * planificar por viento.
 */
export function toGPX(candidate: Candidate, name: string): string {
  const start = Date.parse(candidate.departure);
  const coords = candidate.geometry.coords;
  const total = candidate.evaluation.timeS;
  const n = coords.length;

  const pts = coords
    .map((c, i) => {
      const t = new Date(start + (total * 1000 * i) / Math.max(1, n - 1));
      const ele = c.length > 2 ? `<ele>${c[2].toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${ele}<time>${t.toISOString()}</time></trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ondivento" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(name)}</name>
    <time>${new Date(start).toISOString()}</time>
  </metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>cycling</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGPX(candidate: Candidate, name: string) {
  const blob = new Blob([toGPX(candidate, name)], {
    type: "application/gpx+xml",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\-]+/g, "_").toLowerCase()}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
