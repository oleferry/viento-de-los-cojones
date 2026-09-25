import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternatesFor, jsonLdScript, languageTag, siteUrl } from "@/lib/seo";

// Qué es Ondivento, en texto. La portada es el mapa a pantalla completa: sin
// JavaScript apenas deja 126 palabras, y un buscador o un asistente de IA que
// quiera saber qué hace la app no tiene de dónde sacarlo. Esta página se lo
// cuenta, con lo mismo que dice PRODUCTO.md y nada más.

type Faq = { q: string; a: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return {
    title: t("pageTitle"),
    description: t("description"),
    alternates: alternatesFor(locale, "/como-funciona"),
  };
}

export default async function ComoFunciona({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "About" });

  const what = t.raw("what") as string[];
  const how = t.raw("how") as string[];
  const limits = t.raw("limits") as string[];
  const faq = t.raw("faq") as Faq[];

  // Las preguntas del JSON-LD son las mismas que se ven abajo, palabra por
  // palabra: marcar texto que la página no enseña es lo que penalizan.
  const base = siteUrl();
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${base}/${locale}/como-funciona#faq`,
    inLanguage: languageTag(locale),
    about: { "@id": `${base}/${locale}#app` },
    mainEntity: faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }}
      />
      <Link
        href="/"
        className="text-[0.7rem] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
      >
        {t("back")}
      </Link>

      <h1 className="mt-4 text-[1.4rem] font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--color-ink)]">{t("lead")}</p>

      <div className="mt-7 space-y-6 text-[0.88rem] leading-relaxed text-[var(--color-muted)]">
        <Section title={t("problemTitle")}>
          <p>{t("problemBody")}</p>
        </Section>

        <Section title={t("whatTitle")}>
          <p>{t("whatIntro")}</p>
          <List items={what} />
        </Section>

        <Section title={t("howTitle")}>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {how.map((paso) => (
              <li key={paso}>{paso}</li>
            ))}
          </ol>
          <p className="mt-2">{t("howNote")}</p>
        </Section>

        <Section title={t("limitsTitle")}>
          <List items={limits} />
          <p className="mt-2">{t("limitsNote")}</p>
        </Section>

        <Section title={t("faqTitle")}>
          <dl className="space-y-3">
            {faq.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold text-[var(--color-ink)]">{q}</dt>
                <dd className="mt-0.5">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="pt-2">
          <Link
            href="/"
            className="btn btn-primary inline-block !px-5"
          >
            {t("cta")}
          </Link>
        </p>
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

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
