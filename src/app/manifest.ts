import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ondivento",
    short_name: "Ondivento",
    description:
      "Rutas en bici trazadas según el viento, hora a hora. Pensado para Tierra de Campos.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#080b11",
    theme_color: "#080b11",
    lang: "es",
    categories: ["sports", "navigation", "weather"],
    // Next sirve el icono en /icon.svg a partir de src/app/icon.svg. Un solo
    // vectorial vale para cualquier tamano; Chrome en Android lo acepta para
    // instalar, que es el caso que importa aqui.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
