import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Ondivento — rutas en bici optimizadas según el aire";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 88px",
          background: "linear-gradient(135deg, #0a0e18 0%, #131a2b 55%, #1d1410 100%)",
          color: "#eef2f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#ff8a3d",
            fontWeight: 700,
          }}
        >
          Tierra de Campos
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 18,
            letterSpacing: -2,
          }}
        >
          Ondivento
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: "#93a1b3",
            marginTop: 26,
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          Dices de dónde sales y cuántos kilómetros quieres. Te traza la ruta que
          mejor le viene al aire, hora a hora.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            height: 12,
            width: 640,
            borderRadius: 999,
            background: "linear-gradient(90deg,#34d399,#facc15,#ef4444)",
          }}
        />
      </div>
    ),
    size
  );
}
