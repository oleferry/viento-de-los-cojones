import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { dbEnabled } from "@/lib/db";
import { getShare } from "@/lib/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Ondivento";

/**
 * Tarjeta de vista previa de una ruta compartida: la que sale al pegar el
 * enlace en WhatsApp o en X.
 *
 * Dibuja la forma real del trazado. No simula el viento a proposito: eso
 * costaria una llamada a la prevision y estas imagenes las pide el servidor de
 * WhatsApp, no una persona esperando. La forma, los kilometros y el desnivel
 * ya identifican la ruta.
 */
export default async function ImagenRutaCompartida({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const share = dbEnabled ? await getShare(id) : null;
  const t = await getTranslations({ locale, namespace: "Share" });

  const W = 1200;
  const H = 630;
  // El trazado ocupa la mitad derecha; el texto, la izquierda.
  const CAJA = { x: 620, y: 90, w: 500, h: 450 };

  let path = "";
  if (share?.coords?.length) {
    const lons = share.coords.map((c) => c[0]);
    const lats = share.coords.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // La longitud se encoge con el coseno de la latitud; sin corregirlo, una
    // ruta de Castilla sale estirada a lo ancho.
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const anchoGeo = Math.max(1e-6, (maxLon - minLon) * kx);
    const altoGeo = Math.max(1e-6, maxLat - minLat);
    const escala = Math.min(CAJA.w / anchoGeo, CAJA.h / altoGeo);
    const offX = CAJA.x + (CAJA.w - anchoGeo * escala) / 2;
    const offY = CAJA.y + (CAJA.h - altoGeo * escala) / 2;

    // Como mucho 400 puntos: mas no se distinguen a este tamano y el SVG
    // crece sin motivo.
    const paso = Math.max(1, Math.floor(share.coords.length / 400));
    const puntos: string[] = [];
    for (let i = 0; i < share.coords.length; i += paso) {
      const [lon, lat] = share.coords[i];
      const x = offX + (lon - minLon) * kx * escala;
      // El eje Y de la imagen crece hacia abajo y la latitud hacia arriba.
      const y = offY + (maxLat - lat) * escala;
      puntos.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    path = "M" + puntos.join("L");
  }

  const km = share ? (share.distanceM / 1000).toFixed(1) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0a0e18 0%, #131a2b 55%, #1d1410 100%)",
          color: "#eef2f7",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 60px",
            width: 620,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: "#ff8a3d",
              fontWeight: 700,
            }}
          >
            {t("ogKicker")}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: share && share.name.length > 28 ? 48 : 62,
              fontWeight: 800,
              lineHeight: 1.05,
              marginTop: 20,
              letterSpacing: -1.5,
            }}
          >
            {share ? share.name.slice(0, 60) : "Ondivento"}
          </div>
          <div style={{ display: "flex", gap: 34, marginTop: 34, alignItems: "baseline" }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 800 }}>{km} km</div>
            {share?.ascentM ? (
              <div style={{ display: "flex", fontSize: 38, color: "#93a1b3" }}>
                +{Math.round(share.ascentM)} m
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              color: "#93a1b3",
              marginTop: 26,
              lineHeight: 1.35,
            }}
          >
            {t("ogTagline")}
          </div>
        </div>

        {path ? (
          <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
            <path
              d={path}
              fill="none"
              stroke="#ff8a3d"
              strokeWidth={7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
      </div>
    ),
    size
  );
}
