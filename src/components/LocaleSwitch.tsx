"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES: Record<string, string> = { es: "Español", en: "English" };

/**
 * Cambia de idioma quedandose en la misma pagina. `usePathname` de next-intl
 * devuelve la ruta SIN el prefijo de idioma, asi que basta con volver a
 * navegar a ella con el otro locale.
 */
export default function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otro = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <button
      type="button"
      lang={otro}
      onClick={() => router.replace(pathname, { locale: otro })}
      className="hover:text-[var(--color-muted)]"
    >
      {NAMES[otro] ?? otro}
    </button>
  );
}
