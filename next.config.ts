import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next build` y `next dev` comparten .next por defecto: compilar mientras el
  // servidor de desarrollo esta levantado le borra los chunks y la app se queda
  // a medias (404 que devuelven HTML). `npm run build:check` usa otro directorio.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withNextIntl(nextConfig);
