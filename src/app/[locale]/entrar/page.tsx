import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { auth, authAvailable, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SignIn" });
  // Una pantalla de acceso no resuelve ninguna busqueda. Fuera del indice y
  // fuera del sitemap, para no pedir y prohibir lo mismo a la vez.
  return { title: t("pageTitle"), robots: { index: false, follow: true } };
}

export default async function Entrar({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "SignIn" });

  const session = authAvailable ? await auth() : null;
  if (session?.user) redirect({ href: "/", locale });

  const conGoogle = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const conCorreo = !!process.env.AUTH_RESEND_KEY;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-sm rounded-2xl p-6">
        <Link
          href="/"
          className="text-[0.7rem] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
        >
          {t("backToMap")}
        </Link>

        <h1 className="mt-3 text-[1.1rem] font-bold tracking-tight">{t("heading")}</h1>
        <p className="mt-1 text-[0.78rem] leading-snug text-[var(--color-muted)]">
          {t("blurb")}
        </p>

        {sp["revisa-el-correo"] && (
          <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-2 text-[0.78rem] leading-snug text-emerald-200/90">
            {t("checkEmail")}
          </p>
        )}

        {sp.error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.78rem] leading-snug text-red-200">
            {t("error")}
          </p>
        )}

        {!authAvailable ? (
          <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2.5 text-[0.76rem] leading-snug text-amber-200/90">
            {t("notConfigured")}
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {conGoogle && (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: `/${locale}` });
                }}
              >
                <button type="submit" className="btn btn-primary w-full !py-2.5">
                  {t("withGoogle")}
                </button>
              </form>
            )}

            {conGoogle && conCorreo && (
              <div className="flex items-center gap-3 text-[0.68rem] text-[var(--color-faint)]">
                <span className="h-px flex-1 bg-white/10" />
                {t("or")}
                <span className="h-px flex-1 bg-white/10" />
              </div>
            )}

            {conCorreo && (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("resend", {
                    email: String(formData.get("email") ?? ""),
                    redirectTo: `/${locale}`,
                  });
                }}
                className="space-y-2"
              >
                <label className="label block">{t("yourEmail")}</label>
                <input
                  className="field"
                  type="email"
                  name="email"
                  required
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                />
                <button type="submit" className="btn w-full !py-2.5">
                  {t("sendLink")}
                </button>
                <p className="text-[0.66rem] leading-snug text-[var(--color-faint)]">
                  {t("noPassword")}
                </p>
              </form>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-[0.66rem] text-[var(--color-faint)]">
          {t.rich("legal", {
            terms: (chunks) => (
              <Link
                href="/terminos"
                className="underline underline-offset-2 hover:text-[var(--color-muted)]"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/privacidad"
                className="underline underline-offset-2 hover:text-[var(--color-muted)]"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </main>
  );
}
