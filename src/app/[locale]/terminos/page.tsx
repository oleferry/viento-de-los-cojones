import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Terms" });
  return { title: t("pageTitle") };
}

export default async function Terminos({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Terms" });

  const strong = (chunks: React.ReactNode) => (
    <strong className="text-[var(--color-ink)]">{chunks}</strong>
  );
  const link = (chunks: React.ReactNode) => (
    <Link
      href="/privacidad"
      className="text-[var(--color-accent)] underline underline-offset-2"
    >
      {chunks}
    </Link>
  );
  const mail = (chunks: React.ReactNode) => (
    <a
      href="mailto:privacidad@ondivento.com"
      className="text-[var(--color-accent)] underline underline-offset-2"
    >
      {chunks}
    </a>
  );

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 md:py-14">
      <Link
        href="/"
        className="text-[0.7rem] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
      >
        {t("back")}
      </Link>

      <h1 className="mt-4 text-[1.4rem] font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1.5 text-[0.78rem] text-[var(--color-faint)]">{t("updated")}</p>

      <div className="prose mt-7 space-y-6 text-[0.88rem] leading-relaxed text-[var(--color-muted)]">
        <section>
          <p>{t("intro")}</p>
        </section>

        <Section title={t("estimateTitle")}>
          <p>{t.rich("estimateBody", { b: strong })}</p>
        </Section>

        <Section title={t("availabilityTitle")}>
          <p>{t("availabilityBody")}</p>
        </Section>

        <Section title={t("accountTitle")}>
          <p>{t.rich("accountBody", { mail, privacy: link })}</p>
        </Section>

        <Section title={t("fairUseTitle")}>
          <p>{t("fairUseBody")}</p>
        </Section>

        <Section title={t("changesTitle")}>
          <p>{t("changesBody")}</p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[0.98rem] font-semibold text-[var(--color-ink)]">
        {title}
      </h2>
      {children}
    </section>
  );
}
