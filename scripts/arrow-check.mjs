/**
 * ¿Se ven las flechas de viento en pantallas distintas?
 *
 * El icono se genera en canvas y se registra con un pixelRatio fijo. En una
 * pantalla HiDPI (deviceScaleFactor 2 o 3, que es lo normal en portatiles y
 * moviles) el tamano efectivo cambia, y lo que en el Chrome de pruebas se ve
 * perfecto puede quedar invisible en la del usuario.
 */
import puppeteer from "puppeteer";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] || "https://viento-de-los-cojones.vercel.app";

const escenarios = [
  { nombre: "escritorio 1x", width: 1360, height: 900, dsf: 1 },
  { nombre: "portatil 2x  ", width: 1360, height: 900, dsf: 2 },
  { nombre: "movil 3x     ", width: 390, height: 844, dsf: 3, movil: true },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

for (const e of escenarios) {
  const page = await browser.newPage();
  await page.setViewport({
    width: e.width,
    height: e.height,
    deviceScaleFactor: e.dsf,
    isMobile: !!e.movil,
    hasTouch: !!e.movil,
  });
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /mapa/.test(m.text())) errores.push(m.text().slice(0, 150));
  });

  await page.goto(`${URL_BASE}/?s=-5.027,42.093&sn=Villalon&d=60&sf=carretera`, {
    waitUntil: "networkidle2",
  });
  await sleep(3000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent.trim().startsWith("Trazar ruta")
    );
    b?.click();
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (await page.evaluate(() => /peaje del aire/i.test(document.body.innerText))) break;
  }
  await sleep(4000);

  const info = await page.evaluate(() => {
    const m = window.__vdcMap;
    if (!m) return { error: "sin mapa" };
    const q = (l) => {
      try {
        return m.queryRenderedFeatures(undefined, { layers: [l] }).length;
      } catch (err) {
        return "err:" + err.message;
      }
    };
    let icono = null;
    try {
      const img = m.style?.imageManager?.images?.["wind-arrow"];
      icono = img ? { w: img.data?.width, h: img.data?.height, pixelRatio: img.pixelRatio } : "no registrado";
    } catch {
      icono = "?";
    }
    return {
      dpr: window.devicePixelRatio,
      tieneIcono: m.hasImage("wind-arrow"),
      icono,
      capaFlechas: !!m.getLayer("wind-arrows"),
      ruta: q("route-line"),
      flechas: q("wind-arrows"),
      enFuenteFlechas: (() => {
        try {
          return m.querySourceFeatures("arrows").length;
        } catch {
          return "?";
        }
      })(),
    };
  });
  console.log(`${e.nombre}  dpr=${info.dpr}  ruta=${info.ruta}  FLECHAS=${info.flechas}  fuente=${info.enFuenteFlechas}  icono=${JSON.stringify(info.icono)}`);
  if (errores.length) console.log("     consola:", errores.slice(0, 3).join(" | "));

  await page.screenshot({
    path: `arrow-${e.nombre.trim().replace(/\s+/g, "-")}.png`,
    clip: e.movil
      ? { x: 0, y: 0, width: e.width, height: Math.min(420, e.height) }
      : { x: 440, y: 0, width: 820, height: 800 },
  });
  await page.close();
}

await browser.close();
