import { routing } from "@/i18n/routing";

// Dónde vive el sitio y cómo se declara cada página.
//
// La URL base sale del entorno, igual que en `metadataBase`, para que el mismo
// código sirva en local, en un preview de Vercel y en producción sin que nadie
// tenga que acordarse de cambiarla.
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

/**
 * `alternates` de una página: su canonical y sus versiones por idioma.
 *
 * Las dos cosas van juntas a propósito. Next.js **sustituye** el objeto
 * `alternates` entero cuando una página declara el suyo, no lo mezcla campo a
 * campo con el del layout. Poner solo `canonical` en una página se llevaría por
 * delante el `languages` heredado y la dejaría sin hreflang sin avisar.
 *
 * `ruta` va sin prefijo de idioma: "" para la portada, "/terminos" para los
 * términos. El prefijo lo pone esta función, que es la única que sabe cómo se
 * construye una URL de este sitio.
 */
export function alternatesFor(locale: string, ruta = "") {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}${ruta}`])
  );

  return {
    canonical: `/${locale}${ruta}`,
    languages: {
      ...languages,
      // A quien no encaje en ningún idioma se le manda al que existe desde el
      // principio, no a una raíz que solo redirige.
      "x-default": `/${routing.defaultLocale}${ruta}`,
    },
  };
}
