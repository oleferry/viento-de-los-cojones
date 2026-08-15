/**
 * Copia el worker de MapLibre a `public/maplibre/`.
 *
 * MapLibre 6 deduce la URL de su worker de `import.meta.url`:
 *
 *   if (!/^https?:/.test(import.meta.url)) return "";
 *
 * Los bundlers modernos (Turbopack incluido) reescriben `import.meta.url` a
 * algo que no empieza por http, asi que devuelve cadena vacia y el worker se
 * crea con `new Worker("")`: nace muerto, sin lanzar nada. El basemap raster
 * sigue viendose porque va por el hilo principal, pero TODA fuente GeoJSON se
 * tesela en el worker, asi que la ruta, las flechas y las alternativas quedan
 * invisibles sin un solo error en consola.
 *
 * La solucion es servir el worker nosotros y apuntarle con `setWorkerUrl()`.
 * Se copia en cada build para que no se desincronice de la version instalada.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = join(process.cwd(), "public", "maplibre");

// El worker importa el chunk compartido con una ruta relativa: los dos tienen
// que acabar en la misma carpeta y con el mismo nombre.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(out, { recursive: true });
for (const f of FILES) {
  await copyFile(join(dist, f), join(out, f));
}

const { version } = require("maplibre-gl/package.json");
console.log(`maplibre-gl ${version}: worker copiado a public/maplibre/`);
