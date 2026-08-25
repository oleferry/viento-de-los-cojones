import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { listNotifyCandidates, markNotified } from "@/lib/account";
import { findWindWindow } from "@/lib/digest";
import { dbEnabled } from "@/lib/db";
import { emailAvailable, sendEmail } from "@/lib/email";
import { pickLocale } from "@/lib/i18nServer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ondivento.com";

/**
 * Trabajo en segundo plano (Vercel Cron) que revisa las rutas con aviso
 * activado y manda un correo cuando encuentra una buena ventana de viento en
 * lo que queda del dia. Protegido por CRON_SECRET — Vercel lo manda solo en
 * las llamadas propias del cron, nunca en una peticion de fuera.
 *
 * Se ejecuta UNA vez al dia (06:00 UTC, sobre las 8 en Madrid). No es un
 * capricho: el plan Hobby de Vercel rechaza el despliegue entero si el cron
 * corre mas de una vez al dia. Con una pasada basta, porque `findWindWindow`
 * mira 36 h por delante, asi que el aviso de la manana ya cubre tambien la
 * tarde y el dia siguiente.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  if (!dbEnabled || !emailAvailable) {
    return NextResponse.json({ skipped: true, dbEnabled, emailAvailable });
  }

  const candidates = await listNotifyCandidates();
  let sent = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      const window = await findWindWindow(c);
      if (!window) continue;

      const locale = pickLocale(c.locale);
      const t = await getTranslations({ locale, namespace: "Email" });

      // Dia y hora van SEPARADOS, no en un solo hueco: juntandolos salia
      // "sobre las miércoles, 17:00", que no es castellano. Asi cada idioma
      // los une como le corresponde.
      const bcp47 = locale === "en" ? "en-GB" : "es-ES";
      const cuando = new Date(window.departure);
      const day = cuando.toLocaleDateString(bcp47, {
        timeZone: "Europe/Madrid",
        weekday: "long",
      });
      const time = cuando.toLocaleTimeString(bcp47, {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
      });
      const minutes = Math.round(-window.windCostS / 60);
      // `markup` y no `rich`: esto es una cadena de HTML para un correo, no
      // un arbol de React.
      const bold = (chunks: string) => `<strong>${chunks}</strong>`;

      const html = `
        <p>${t.markup("intro", { route: c.routeName, b: bold })}</p>
        <p>${t.markup("body", { day, time, minutes, b: bold })}</p>
        <p><a href="${SITE_URL}/${locale}">${t("cta")}</a></p>
        <p style="color:#888;font-size:0.8em">${t("why")}</p>
      `;

      const ok = await sendEmail(c.userEmail, t("subject", { route: c.routeName }), html);
      if (ok) {
        await markNotified(c.routeId);
        sent++;
      } else {
        errors.push(`${c.routeId}: envio fallido`);
      }
    } catch (err) {
      errors.push(`${c.routeId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ checked: candidates.length, sent, errors });
}
