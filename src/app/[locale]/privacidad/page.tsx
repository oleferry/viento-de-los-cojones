import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("pageTitle") };
}

const MAIL = "privacidad@ondivento.com";

function Mail() {
  return (
    <a
      href={`mailto:${MAIL}`}
      className="text-[var(--color-accent)] underline underline-offset-2"
    >
      {MAIL}
    </a>
  );
}

export default async function Privacidad({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Privacy" });

  const strong = (chunks: React.ReactNode) => (
    <strong className="text-[var(--color-ink)]">{chunks}</strong>
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
        <Section title={t("whoTitle")}>
          <p>{t.rich("whoBody", { mail: () => <Mail /> })}</p>
        </Section>

        <Section title={t("noAccountTitle")}>
          <p>{t.rich("noAccountBody", { b: strong })}</p>
        </Section>

        <Section title={t("accountTitle")}>
          <p>{t("accountIntro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t.rich("accountIdentity", { b: strong })}</li>
            <li>{t.rich("accountProfile", { b: strong })}</li>
            <li>{t.rich("accountBikes", { b: strong })}</li>
            <li>{t.rich("accountRoutes", { b: strong })}</li>
            <li>{t.rich("accountAlerts", { b: strong })}</li>
          </ul>
          <p className="mt-2">{t.rich("accountDelete", { mail: () => <Mail /> })}</p>
        </Section>

        <Section title={t("thirdTitle")}>
          <p>{t("thirdIntro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t.rich("thirdGeo", { b: strong })}</li>
            <li>{t.rich("thirdGoogle", { b: strong })}</li>
            <li>{t.rich("thirdResend", { b: strong })}</li>
            <li>{t.rich("thirdCarto", { b: strong })}</li>
            <li>{t.rich("thirdVercel", { b: strong })}</li>
          </ul>
        </Section>

        <Section title={t("cookiesTitle")}>
          <p>{t.rich("cookiesBody", { b: strong })}</p>
        </Section>

        <Section title={t("rightsTitle")}>
          <p>{t.rich("rightsBody", { mail: () => <Mail /> })}</p>
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
