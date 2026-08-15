"use client";

import { useEffect, useState } from "react";

interface PromptInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DESCARTADO = "vdc.instalar.no";

/** Registra el trabajador de servicio. Va suelto, sin pintar nada. */
export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/**
 * Invitacion a instalar la app.
 *
 * Va DENTRO del panel y no flotando: como banner fijo abajo tapaba las
 * estadisticas de la ruta, que es justo lo que se ha ido a mirar. Aqui
 * acompana al formulario y desaparece al descartarla.
 *
 * Android deja capturar el evento de instalacion y ensenar un boton propio;
 * iOS no, alli hay que pasar por Compartir. Se detecta y se explica, en vez de
 * ofrecer un boton que alli no haria nada.
 */
export default function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const yaInstalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (yaInstalada) return;

    try {
      if (localStorage.getItem(DESCARTADO) === "1") return;
    } catch {
      /* sin almacenamiento */
    }

    const esIOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent);
    if (esIOS) {
      setIos(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptInstalacion);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const descartar = () => {
    setVisible(false);
    try {
      localStorage.setItem(DESCARTADO, "1");
    } catch {
      /* sin almacenamiento */
    }
  };

  return (
    <div className="card rise flex items-center gap-2 px-3 py-2.5">
      <span className="min-w-0 flex-1 text-[0.72rem] leading-snug text-[var(--color-muted)]">
        {ios ? (
          <>
            Para tenerla como app: <b className="text-[var(--color-ink)]">Compartir</b> →{" "}
            <b className="text-[var(--color-ink)]">Añadir a pantalla de inicio</b>.
          </>
        ) : (
          "Instálala y la tienes como app, sin barra del navegador y abriendo sin cobertura."
        )}
      </span>
      {prompt && (
        <button
          className="btn shrink-0 !min-h-9 !px-3 !py-1.5 !text-[0.72rem]"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            setVisible(false);
          }}
        >
          Instalar
        </button>
      )}
      <button
        onClick={descartar}
        aria-label="No instalar"
        className="grid h-11 w-8 shrink-0 place-items-center text-[1.1rem] leading-none text-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        ×
      </button>
    </div>
  );
}
