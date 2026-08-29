import Planner from "@/components/Planner";
import { RegistrarSW } from "@/components/PWA";
import { alternatesFor } from "@/lib/seo";

// El título y la descripción se heredan del layout; aquí solo se declara qué
// URL es esta página. No puede ir en el layout: un `alternates.canonical` allí
// lo heredarían todas las páginas que no pongan el suyo, y media web acabaría
// declarándose como la portada — peor que no tener ninguno.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return { alternates: alternatesFor(locale) };
}

export default function Home() {
  return (
    <>
      <Planner />
      <RegistrarSW />
    </>
  );
}
