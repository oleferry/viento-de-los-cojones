/**
 * Diagnostico de bajo nivel del mapa: intercepta `Worker` antes de que cargue
 * nada y vuelca el estado interno del estilo de MapLibre.
 *
 * Existe porque un worker muerto no da la cara: el basemap raster se ve (va por
 * el hilo principal) pero ninguna fuente GeoJSON se tesela, asi que la ruta
 * simplemente no aparece y la consola queda limpia. Si algun dia vuelve a
 * pasar, esto lo enseña en tres segundos.
 *
 *   node scripts/probe.mjs [salida.png]
 */
import puppeteer from "puppeteer";
import { setTimeout as sleep } from "node:timers/promises";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900 });

// Interceptamos Worker ANTES de que cargue nada, para ver si MapLibre lo crea
// y si arranca. Las fuentes GeoJSON se tesela por completo en el worker.
await page.evaluateOnNewDocument(() => {
  window.__workers = [];
  const Real = window.Worker;
  window.Worker = class extends Real {
    constructor(url, opts) {
      const info = { url: String(url), opts, errors: [], creado: true };
      window.__workers.push(info);
      super(url, opts);
      this.addEventListener("error", (e) => {
        info.errors.push(e.message || "error sin mensaje");
      });
      this.addEventListener("messageerror", () => info.errors.push("messageerror"));
    }
  };
});

page.on("console", (m) => {
  const t = m.text();
  if (/mapa|worker|Worker|error/i.test(t)) console.log("  [browser]", t.slice(0, 220));
});
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 220)));
page.on("requestfailed", (r) => {
  if (/worker|\.js/i.test(r.url())) console.log("  [reqfail]", r.url().slice(0, 130), r.failure()?.errorText);
});

await page.goto("http://localhost:3000/?s=-5.027,42.093&sn=Villalon&d=70", {
  waitUntil: "networkidle2",
});
await sleep(5000);

console.log("\n1) WORKERS CREADOS");
console.log("  ", JSON.stringify(await page.evaluate(() => window.__workers), null, 2));

console.log("\n2) ESTADO INTERNO DEL ESTILO");
console.log(
  "  ",
  JSON.stringify(
    await page.evaluate(() => {
      const m = window.__vdcMap;
      const st = m?.style;
      return {
        styleLoadedPublico: m?.isStyleLoaded(),
        // Bandera interna: es la que gobierna si se pueden anadir capas.
        _loaded: st?._loaded ?? "no accesible",
        sourceCaches: st
          ? Object.keys(st.sourceCaches ?? st._sourceCaches ?? {})
          : null,
        dispatcherReady: !!(st?.dispatcher ?? st?._dispatcher),
      };
    })
  )
);

console.log("\n3) INYECTAR UNA LINEA A MANO");
console.log(
  "  ",
  JSON.stringify(
    await page.evaluate(async () => {
      const m = window.__vdcMap;
      const src = m.getSource("route");
      const c = m.getCenter();
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { hw: 5 },
            geometry: {
              type: "LineString",
              coordinates: [
                [c.lng - 0.3, c.lat - 0.2],
                [c.lng + 0.3, c.lat + 0.2],
              ],
            },
          },
        ],
      });
      m.triggerRepaint();
      await new Promise((r) => setTimeout(r, 3000));
      return {
        enFuente: m.querySourceFeatures("route").length,
        renderizado: m.queryRenderedFeatures(undefined, { layers: ["route-line"] }).length,
      };
    })
  )
);

await page.screenshot({ path: process.argv[2] || "probe.png" });
await browser.close();
