import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// No existía ninguno: `/robots.txt` devolvía 404.
//
// Lo que se bloquea y por qué:
//
//   /api        No son páginas. Rastrearlas gasta presupuesto de rastreo y
//               algunas cuestan una llamada a un servicio externo con cupo.
//   */entrar    Una pantalla de acceso no resuelve ninguna búsqueda.
//   */r/        Rutas compartidas. Son de una persona concreta y a menudo
//               empiezan en su casa: no tienen por qué acabar en un buscador.
//               El enlace se comparte, que es distinto de publicarse.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/es/entrar", "/en/entrar", "/es/r/", "/en/r/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
