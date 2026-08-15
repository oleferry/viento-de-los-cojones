/**
 * Comprobacion visual del mapa en un Chrome de verdad.
 *
 * El mapa es WebGL: no se puede verificar leyendo el DOM ni con un navegador
 * que no compone frames, porque MapLibre carga el estilo y pide las teselas
 * desde su bucle de render. Este script abre Chrome, traza una ruta, vuelca el
 * estado interno del mapa y saca una captura.
 *
 *   node scripts/visual-check.mjs [url] [salida.png]
 */
import puppeteer from "puppeteer";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] || "http://localhost:3000";
const OUT = process.argv[3] || "map-check.png";

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--no-sandbox",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 1 });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.slice(0, 400)}`));
page.on("requestfailed", (r) =>
  logs.push(`[reqfail] ${r.url().slice(0, 130)} ${r.failure()?.errorText}`)
);

const url = `${URL_BASE}/?s=-5.027,42.093&sn=Villalon&d=70&sf=carretera&m=tailwind_home`;
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(3500);

async function mapState(label) {
  const s = await page.evaluate(() => {
    const m = window.__vdcMap;
    if (!m) return { error: "window.__vdcMap no existe" };
    const feats = (id) => {
      try {
        const src = m.getSource(id);
        if (!src) return "SIN FUENTE";
        const d = src._data ?? src.serialize?.().data;
        return typeof d === "object" ? d?.features?.length ?? "?" : "?";
      } catch (e) {
        return "err:" + e.message;
      }
    };
    return {
      styleLoaded: m.isStyleLoaded(),
      loaded: m.loaded(),
      layers: m.getStyle()?.layers?.map((l) => l.id) ?? [],
      sources: Object.keys(m.getStyle()?.sources ?? {}),
      hasArrowImg: m.hasImage("wind-arrow"),
      route: feats("route"),
      arrows: feats("arrows"),
      alts: feats("alts"),
      canvas: [m.getCanvas().clientWidth, m.getCanvas().clientHeight],
      zoom: +m.getZoom().toFixed(2),
      center: [+m.getCenter().lng.toFixed(3), +m.getCenter().lat.toFixed(3)],
    };
  });
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(s, null, 2));
  return s;
}

await mapState("ANTES DE TRAZAR");

const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    x.textContent.trim().startsWith("Trazar ruta")
  );
  if (!b) return "sin boton";
  if (b.disabled) return "boton deshabilitado";
  b.click();
  return "pulsado";
});
console.log("\nboton:", clicked);

let ready = false;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  if (await page.evaluate(() => /peaje del aire/i.test(document.body.innerText))) {
    ready = true;
    break;
  }
}
console.log("panel de resultados:", ready ? "presente" : "NO APARECE");
await sleep(5000);

const after = await mapState("DESPUES DE TRAZAR");

// Lo que MapLibre dice que esta RENDERIZANDO ahora mismo. Es la pregunta
// correcta: leer el canvas WebGL con readPixels devuelve ceros porque el buffer
// no se preserva entre frames.
const rendered = await page.evaluate(() => {
  const m = window.__vdcMap;
  if (!m) return { error: "sin mapa" };
  const q = (layer) => {
    try {
      return m.queryRenderedFeatures(undefined, { layers: [layer] }).length;
    } catch (e) {
      return "err:" + e.message;
    }
  };
  const src = (id) => {
    try {
      return m.querySourceFeatures(id).length;
    } catch (e) {
      return "err:" + e.message;
    }
  };
  return {
    renderizado: { ruta: q("route-line"), flechas: q("wind-arrows"), alternativas: q("alts-line") },
    enFuente: { route: src("route"), arrows: src("arrows"), alts: src("alts") },
  };
});
console.log("\n--- LO QUE EL MAPA ESTA RENDERIZANDO ---");
console.log(JSON.stringify(rendered, null, 2));

const shot = await page.screenshot({ path: OUT, encoding: "base64" });
console.log(`\ncaptura -> ${OUT}`);

// Analisis de la captura ya compuesta (esto si refleja lo que se ve).
const pixels = await page.evaluate(async (b64) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = "data:image/png;base64," + b64;
  });
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  // Solo la zona del mapa: a la derecha del panel lateral (~430 px).
  const x0 = 460;
  const d = ctx.getImageData(x0, 0, cv.width - x0, cv.height).data;
  let verde = 0, rojo = 0, ambar = 0, blanco = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    total++;
    if (g > 120 && r < 120 && g - r > 40 && g - b > 20) verde++;
    else if (r > 140 && g < 120 && r - g > 50 && r - b > 50) rojo++;
    else if (r > 170 && g > 130 && b < 120 && r - b > 60 && Math.abs(r - g) < 90) ambar++;
    else if (r > 200 && g > 200 && b > 200) blanco++;
  }
  return { total, verde, rojo, ambar, blanco, pintados: verde + rojo + ambar };
}, shot);
console.log("\n--- PIXELES EN LA CAPTURA (zona del mapa) ---");
console.log(JSON.stringify(pixels));

// Recorte solo del mapa, para mirarlo sin el panel encima.
await page.evaluate(() => {
  // Cerrar el desplegable del buscador, que tapa medio panel.
  document.body.click();
});
await sleep(600);
await page.screenshot({
  path: OUT.replace(/\.png$/, "-mapa.png"),
  clip: { x: 440, y: 0, width: 920, height: 900 },
});
console.log(`recorte -> ${OUT.replace(/\.png$/, "-mapa.png")}`);

// --- tema claro ---------------------------------------------------------
console.log("\n--- CAMBIO A MAPA CLARO ---");
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(
    (x) => x.textContent.trim() === "Claro"
  );
  b?.click();
});
await sleep(6000);
const light = await page.evaluate(() => {
  const m = window.__vdcMap;
  return {
    basemap: m.getStyle()?.sources?.carto?.tiles?.[0]?.match(/cartocdn\.com\/(\w+)\//)?.[1],
    ruta: m.queryRenderedFeatures(undefined, { layers: ["route-line"] }).length,
    flechas: m.queryRenderedFeatures(undefined, { layers: ["wind-arrows"] }).length,
    capas: m.getStyle()?.layers?.map((l) => l.id),
  };
});
console.log(JSON.stringify(light, null, 2));
await page.screenshot({
  path: OUT.replace(/\.png$/, "-claro.png"),
  clip: { x: 440, y: 0, width: 920, height: 900 },
});
console.log(`recorte claro -> ${OUT.replace(/\.png$/, "-claro.png")}`);
if (!(light.ruta > 0)) {
  console.log("  !! la ruta desaparece al cambiar de tema");
}

console.log("\n--- CONSOLA DEL NAVEGADOR ---");
for (const l of logs.slice(-45)) console.log("  " + l);

await browser.close();

const bien =
  after.layers?.includes("route-line") &&
  Number(rendered?.renderizado?.ruta) > 0 &&
  Number(rendered?.renderizado?.flechas) > 0 &&
  pixels?.pintados > 300;
console.log(bien ? "\n>>> LA RUTA SE ESTA PINTANDO\n" : "\n>>> LA RUTA NO SE PINTA\n");
process.exit(bien ? 0 : 1);
