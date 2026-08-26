import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Planner from "@/components/Planner";
import { RegistrarSW } from "@/components/PWA";
import { dbEnabled } from "@/lib/db";
import { getShare } from "@/lib/share";
import type { Surface, WindMode } from "@/lib/types";

// La ruta compartida se lee de la base de datos en cada visita: sin base de
// datos configurada, esta pagina simplemente no existe.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const share = dbEnabled ? await getShare(id) : null;
  if (!share) return {};

  const t = await getTranslations({ locale, namespace: "Share" });
  const km = (share.distanceM / 1000).toFixed(1);
  return {
    title: t("metaTitle", { name: share.name }),
    description: t("metaDescription", { name: share.name, km }),
    openGraph: {
      title: share.name,
      description: t("metaDescription", { name: share.name, km }),
    },
  };
}

export default async function RutaCompartida({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const share = dbEnabled ? await getShare(id) : null;
  if (!share) notFound();

  return (
    <>
      <Planner
        initialTrack={{
          name: share.name,
          coords: share.coords,
          hasElevation: (share.coords[0]?.length ?? 0) > 2,
        }}
        initialSurface={share.surface as Surface}
        initialWindMode={share.windMode as WindMode}
      />
      <RegistrarSW />
    </>
  );
}
