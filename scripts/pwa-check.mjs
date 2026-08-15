/**
 * Comprueba que la PWA es instalable y que abre sin conexion.
 *
 * Lo importante no es que exista el manifest, sino el comportamiento: que el
 * trabajador de servicio se registre, que guarde el armazon y que con la red
 * cortada la app siga abriendo — pero que NO sirva previsiones viejas, que en
 * una app de viento seria peor que fallar.
 */
import puppeteer from "puppeteer";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] || "https://viento-de-los-cojones.vercel.app";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

let fallos = 0;
const check = (etiqueta, ok, extra = "") => {
  if (!ok) fallos++;
  console.log(`  [${ok ? "OK  " : "FALLA"}] ${etiqueta}${extra ? "  — " + extra : ""}`);
};

console.log("\n== MANIFEST ==");
const man = await (await fetch(`${URL_BASE}/manifest.webmanifest`)).json();
check("nombre corto", man.short_name === "Viento", man.short_name);
check("display standalone", man.display === "standalone", man.display);
check("start_url", man.start_url === "/", man.start_url);
check("tiene icono", (man.icons?.length ?? 0) > 0);
check("icono maskable", man.icons?.some((i) => i.purpose?.includes("maskable")));
check("color de tema", !!man.theme_color, man.theme_color);

console.log("\n== TRABAJADOR DE SERVICIO ==");
await page.goto(URL_BASE, { waitUntil: "networkidle2" });
await sleep(6000);

const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    registrado: !!reg,
    activo: !!reg?.active,
    alcance: reg?.scope ?? null,
    caches: await caches.keys(),
  };
});
check("registrado", sw.registrado);
check("activo", sw.activo);
check("caches creados", sw.caches.length > 0, sw.caches.join(", "));

const guardado = await page.evaluate(async () => {
  const c = await caches.open("armazon-v1");
  const claves = (await c.keys()).map((r) => new URL(r.url).pathname);
  return claves;
});
check("armazon guardado", guardado.length > 0, `${guardado.length} recursos`);

console.log("\n== LA PREVISION NO SE CACHEA ==");
const apiCacheada = await page.evaluate(async () => {
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    for (const r of await c.keys()) {
      if (r.url.includes("/api/") || r.url.includes("open-meteo")) return r.url;
    }
  }
  return null;
});
check("nada de /api ni Open-Meteo en cache", !apiCacheada, apiCacheada ?? "limpio");

console.log("\n== SIN CONEXION ==");
await page.setOfflineMode(true);
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await sleep(3000);
const offline = await page.evaluate(() => ({
  titulo: document.querySelector("h1")?.textContent ?? null,
  hayBoton: [...document.querySelectorAll("button")].some((b) =>
    b.textContent.includes("Trazar ruta")
  ),
}));
check("la app abre sin red", offline.titulo === "Viento de los cojones", offline.titulo ?? "en blanco");
check("el formulario esta ahi", offline.hayBoton);
await page.setOfflineMode(false);

await browser.close();
console.log(fallos === 0 ? "\nPWA CORRECTA\n" : `\n${fallos} COMPROBACIONES FALLIDAS\n`);
process.exit(fallos ? 1 : 0);
