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
  title: "Viento de los cojones — rutas en bici optimizadas por el aire",
  description: DESCRIPTION,
  applicationName: "Viento de los cojones",
  openGraph: {
    type: "website",
    locale: "es_ES",
    title: "Viento de los cojones",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
