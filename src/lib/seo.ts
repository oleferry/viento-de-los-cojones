import { routing } from "@/i18n/routing";

/** Nombre del producto, tal como se presenta en metadatos y datos estructurados. */
export const SITE_NAME = "Ondivento";

/**
 * Quién está detrás del sitio. Es la identidad que la página de privacidad
 * declara ("proyecto personal de …"): el texto visible y los datos
 * estructurados leen este mismo valor para que no puedan decir cosas distintas.
 */
export const PUBLISHER_NAME = "Daniel Paniagua";

/** Etiqueta de idioma con región (BCP 47) de cada locale del sitio. */
export function languageTag(locale: string): string {
  return locale === "en" ? "en-US" : "es-ES";
}

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

/**
 * Datos estructurados (schema.org, JSON-LD) que describen el sitio: qué es la
 * aplicación, qué web la sirve y quién la publica. Lo leen los buscadores y los
 * asistentes de IA, que sin esto solo ven un mapa y tienen que adivinar.
 *
 * Solo lleva lo que el propio sitio dice en alguna parte visible:
 * - la descripción es la misma de `<meta name="description">`;
 * - el precio 0 sale de los términos de uso ("proyecto personal, gratuito");
 * - el editor es la identidad que da la página de privacidad.
 * Nada de valoraciones, reseñas ni cifras de uso: no existen, y inventarlas en
 * el marcado es exactamente lo que penalizan los buscadores.
 *
 * `description` llega ya traducida porque este módulo no sabe de next-intl.
 */
export function structuredData(locale: string, description: string) {
  const base = siteUrl();
  const home = `${base}/${locale}`;
  const inLanguage = languageTag(locale);
  const publisher = { "@id": `${base}/#publisher` };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${home}#app`,
        name: SITE_NAME,
        url: home,
        description,
        applicationCategory: "SportsApplication",
        operatingSystem: "Web",
        inLanguage,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        publisher,
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: SITE_NAME,
        url: home,
        description,
        inLanguage,
        publisher,
      },
      {
        "@type": "Person",
        "@id": publisher["@id"],
        name: PUBLISHER_NAME,
      },
    ],
  };
}

/**
 * Serializa para un `<script type="application/ld+json">`. `JSON.stringify` no
 * escapa `<`, y un `</script>` dentro de un texto cerraría la etiqueta antes de
 * tiempo; es lo que recomienda la guía de JSON-LD de Next.js.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
