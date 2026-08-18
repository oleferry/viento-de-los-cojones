/**
 * Revision de la app en pantallas de movil.
 *
 * Captura los estados que de verdad se usan (formulario, resultados, perfil) en
 * varios tamanos, y ademas detecta automaticamente los dos pecados clasicos:
 * desbordamiento horizontal y elementos mas anchos que la pantalla.
 *
 *   node scripts/mobile-check.mjs [url] [carpeta-salida]
 */
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] || "https://ondivento.com";
const OUT = process.argv[3] || "mobile";
await mkdir(OUT, { recursive: true });

const PANTALLAS = [
  { id: "iphone-se", w: 375, h: 667, dsf: 2 },
  { id: "iphone-14", w: 390, h: 844, dsf: 3 },
  { id: "pixel-7", w: 412, h: 915, dsf: 2.6 },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

/** Busca lo que se sale de la pantalla o toca demasiado pequeno. */
const AUDITORIA = `(() => {
  const vw = document.documentElement.clientWidth;
  const desbordes = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
      desbordes.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 60),
        left: Math.round(r.left), right: Math.round(r.right),
        txt: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  const pequenos = [];
  for (const el of document.querySelectorAll("button, a, select, input[type=range]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 32 || r.width < 28) {
      pequenos.push({
        tag: el.tagName.toLowerCase(),
        w: Math.round(r.width), h: Math.round(r.height),
        txt: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
      });
    }
  }
  return {
    scrollHorizontal: document.documentElement.scrollWidth > vw + 1,
    anchoDoc: document.documentElement.scrollWidth, vw,
    desbordes: desbordes.slice(0, 8),
    pequenos: pequenos.slice(0, 10),
  };
})()`;

for (const p of PANTALLAS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: p.w, height: p.h, deviceScaleFactor: p.dsf, isMobile: true, hasTouch: true,
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
  );

  await page.goto(`${URL_BASE}/?s=-5.027,42.093&sn=Villalon&d=60&sf=carretera`, {
    waitUntil: "networkidle2",
  });
  await sleep(3000);

  const paso = async (nombre) => {
    const a = await page.evaluate(AUDITORIA);
    console.log(`\n${p.id} · ${nombre}  (${a.vw}px, documento ${a.anchoDoc}px)`);
    console.log(`  scroll horizontal: ${a.scrollHorizontal ? "SI  <-- mal" : "no"}`);
    for (const d of a.desbordes) {
      console.log(`  se sale: <${d.tag}> ${d.left}..${d.right}  "${d.txt}"  ${d.cls}`);
    }
    for (const s of a.pequenos) {
      console.log(`  toque pequeno: <${s.tag}> ${s.w}x${s.h}  "${s.txt}"`);
    }
    await page.screenshot({ path: join(OUT, `${p.id}-${nombre}.png`) });
  };

  await paso("1-formulario");

  // Abrir el panel del todo (en movil arranca contraido).
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label")?.includes("Expandir")
    );
    b?.click();
  });
  await sleep(700);
  await paso("2-panel-abierto");

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
  await sleep(3000);
  await paso("3-resultados");

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent.includes("Perfil de ciclista")
    );
    b?.click();
  });
  await sleep(800);
  await paso("4-perfil");

  await page.close();
}

await browser.close();
console.log(`\ncapturas en ${OUT}/\n`);
