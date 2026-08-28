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
const RUTAS = ["", "/privacidad", "/terminos"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return routing.locales.flatMap((locale) =>
    RUTAS.map((ruta) => ({
      url: `${base}/${locale}${ruta}`,
      changeFrequency: ruta === "" ? ("weekly" as const) : ("yearly" as const),
      priority: ruta === "" ? 1 : 0.3,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${base}/${l}${ruta}`])
        ),
      },
    }))
  );
}
