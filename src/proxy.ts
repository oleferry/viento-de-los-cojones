import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export const proxy = createMiddleware(routing);

export const config = {
  // Todo menos la API, los ficheros estaticos y las rutas especiales que Next
  // genera solo (manifest, icono, imagen para compartir): esas se sirven sin
  // prefijo de idioma, iguales para todo el mundo.
  matcher: [
    "/((?!api|_next|manifest\\.webmanifest|opengraph-image|icon\\.svg|.*\\.).*)",
  ],
};
