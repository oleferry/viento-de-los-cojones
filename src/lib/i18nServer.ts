import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Traductor minimo que se le pasa al motor.
 *
 * El planificador y el analizador no saben nada de next-intl a proposito: son
 * fisica y geometria, y reciben una funcion para poner nombre a las cosas. Asi
 * siguen siendo probables sin montar medio framework.
 */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Lo que el motor necesita saber del idioma: como traducir y cual es. */
export interface I18n {
  t: Translate;
  locale: string;
}

/** Por defecto no traduce nada: devuelve la clave. Util en pruebas. */
export const NO_I18N: I18n = { t: (k) => k, locale: "es" };

/** Idioma pedido por el cliente, saneado contra la lista de idiomas reales. */
export function pickLocale(raw: unknown): string {
  return typeof raw === "string" && (routing.locales as readonly string[]).includes(raw)
    ? raw
    : routing.defaultLocale;
}

export async function serverI18n(locale: string): Promise<I18n> {
  const t = await getTranslations({ locale, namespace: "Server" });
  return { t: (key, values) => t(key, values), locale };
}

/**
 * Idioma de una peticion a la API, sacado de la cookie que deja el proxy de
 * next-intl en cada visita. Sirve para GET y DELETE, que no llevan cuerpo
 * donde meter el idioma.
 */
export async function requestI18n(request: Request): Promise<I18n> {
  const cookie = request.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookie);
  return serverI18n(pickLocale(m?.[1]));
}
