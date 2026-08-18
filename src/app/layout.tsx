import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION =
  "Planificador de rutas ciclistas que usa la previsión de viento hora a hora para decidir por dónde salir y a qué hora. Pensado para Tierra de Campos.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: "Ondivento — rutas en bici optimizadas por el aire",
  description: DESCRIPTION,
  applicationName: "Ondivento",
  openGraph: {
    type: "website",
    locale: "es_ES",
    title: "Ondivento",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  // iOS no lee el manifest para esto: hay que decirselo aparte.
  appleWebApp: {
    capable: true,
    title: "Ondivento",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#080b11",
  width: "device-width",
  initialScale: 1,
  // La app ocupa la pantalla entera y el mapa ya tiene su propio zoom: el zoom
  // del navegador solo descoloca el panel.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
