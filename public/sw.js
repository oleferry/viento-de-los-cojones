/**
 * Trabajador de servicio.
 *
 * Deliberadamente conservador: esta app depende de la PREVISION, y servir un
 * viento de ayer seria peor que no servir nada. Asi que:
 *
 *   - El armazon (HTML, JS, CSS, iconos) se guarda para que la app abra al
 *     instante y arranque sin cobertura, que en Tierra de Campos pasa.
 *   - Las peticiones a /api NUNCA se cachean. Sin red, se falla y ya.
 *   - Las teselas del mapa se guardan un rato: son inmutables y pesan.
 */
const VERSION = "v1";
const ARMAZON = `armazon-${VERSION}`;
const TESELAS = `teselas-${VERSION}`;
const MAX_TESELAS = 300;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(ARMAZON)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon.svg"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((k) => k !== ARMAZON && k !== TESELAS)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Recorta el cache de teselas para no llenar el movil sin permiso. */
async function podar(nombre, maximo) {
  const c = await caches.open(nombre);
  const claves = await c.keys();
  if (claves.length <= maximo) return;
  await Promise.all(claves.slice(0, claves.length - maximo).map((k) => c.delete(k)));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // La prevision y las rutas, siempre frescas. Nunca del cache.
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;
  if (url.hostname.endsWith("open-meteo.com")) return;

  // Teselas del mapa: del cache si estan, y si no se descargan y se guardan.
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    e.respondWith(
      caches.open(TESELAS).then(async (c) => {
        const guardada = await c.match(req);
        if (guardada) return guardada;
        const res = await fetch(req);
        if (res.ok) {
          c.put(req, res.clone());
          podar(TESELAS, MAX_TESELAS);
        }
        return res;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navegacion: red primero para no servir una version vieja de la app, con el
  // cache como red de seguridad cuando no hay cobertura.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(ARMAZON).then((c) => c.put("/", copia));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // Estaticos de Next: llevan hash en el nombre, asi que del cache sin dudar.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/maplibre/")) {
    e.respondWith(
      caches.open(ARMAZON).then(async (c) => {
        const guardada = await c.match(req);
        if (guardada) return guardada;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
  }
});
