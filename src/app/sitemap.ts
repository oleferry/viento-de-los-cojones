import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo";

// No existía ninguno: `/sitemap.xml` devolvía 404.
//
// Solo entran las páginas que el sitio publica de verdad. Fuera quedan
// `/entrar` (no resuelve ninguna búsqueda) y `/r/<id>` (rutas de una persona,
// en número ilimitado y con su punto de partida dentro). Ver `robots.ts`.
//
// Cada página aparece una vez por idioma y declara sus equivalentes, que es lo
// que le dice al buscador que /es/terminos y /en/terminos son la misma página
// en dos lenguas y no dos páginas compitiendo.
const RUTAS = ["", "/como-funciona", "/privacidad", "/terminos"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return routing.locales.flatMap((locale) =>
    RUTAS.map((ruta) => ({
      url: `${base}/${locale}${ruta}`,
      changeFrequency: ruta === "" ? ("weekly" as const) : ("yearly" as const),
      // «Cómo funciona» es la única página con texto que explique la app: la
      // portada es el mapa. Por eso va por encima de las legales.
      priority: ruta === "" ? 1 : ruta === "/como-funciona" ? 0.8 : 0.3,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${base}/${l}${ruta}`])
        ),
      },
    }))
  );
}
