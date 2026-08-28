import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/lib/seo";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ??
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "http://localhost:3000")
    ),
    title: t("title"),
    description: t("description"),
    applicationName: "Ondivento",
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "es_ES",
      title: "Ondivento",
      description: t("description"),
    },
    twitter: { card: "summary_large_image" },
    // iOS no lee el manifest para esto: hay que decirselo aparte.
    appleWebApp: {
      capable: true,
      title: "Ondivento",
      statusBarStyle: "black-translucent",
    },
    // Valor de reserva, correcto solo para la portada. Cada página declara el
    // suyo con `alternatesFor()` y tiene que seguir haciéndolo: Next.js
    // **sustituye** este objeto entero cuando una página trae el suyo, no lo
    // mezcla campo a campo. Una página nueva que no lo declare heredaría estas
    // rutas y diría que es la portada.
    alternates: alternatesFor(locale),
  };
}

export const viewport: Viewport = {
  themeColor: "#080b11",
  width: "device-width",
  initialScale: 1,
  // La app ocupa la pantalla entera y el mapa ya tiene su propio zoom: el zoom
  // del navegador solo descoloca el panel.
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Necesario para que las paginas de dentro puedan renderizarse estaticas:
  // sin esto next-intl fuerza render dinamico en todo lo que use useTranslations.
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          {children}
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
