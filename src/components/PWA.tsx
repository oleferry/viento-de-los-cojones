"use client";

import { useEffect, useState } from "react";

interface PromptInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registra el trabajador de servicio y ofrece instalar la app.
 *
 * Android deja capturar el evento de instalacion y ensenar un boton propio;
 * iOS no, alli hay que decirle a la persona que use Compartir -> Anadir a
 * pantalla de inicio. Se detecta el caso y se explica, en vez de ensenar un
 * boton que en iOS no haria nada.
 */
export default function PWA() {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null);
  const [iosSinInstalar, setIosSinInstalar] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const yaInstalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (yaInstalada) return;

    try {
      if (localStorage.getItem("vdc.instalar.no") === "1") return;
    } catch {
      /* sin almacenamiento */
    }

    const esIOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent);
    if (esIOS) {
      setIosSinInstalar(true);
      setOculto(false);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptInstalacion);
      setOculto(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const cerrar = () => {
    setOculto(true);
    try {
      localStorage.setItem("vdc.instalar.no", "1");
    } catch {
      /* sin almacenamiento */
    }
  };

  if (oculto || (!prompt && !iosSinInstalar)) return null;

  return (
    <div className="glass rise fixed inset-x-2 bottom-2 z-40 flex items-center gap-3 rounded-xl px-3 py-2.5 md:left-auto md:right-3 md:w-80">
      <span className="min-w-0 flex-1 text-[0.75rem] leading-snug">
        {iosSinInstalar ? (
          <>
            Para tenerla como app: <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.
          </>
        ) : (
          "Instálala y la tienes como app, sin barra del navegador."
        )}
      </span>
      {prompt && (
        <button
          className="btn btn-primary shrink-0 !px-3 !py-1.5 !text-[0.75rem]"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            setOculto(true);
          }}
        >
          Instalar
        </button>
      )}
      <button
        onClick={cerrar}
        aria-label="No, gracias"
        className="shrink-0 px-1 text-[1.1rem] leading-none text-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        ×
      </button>
    </div>
  );
}
