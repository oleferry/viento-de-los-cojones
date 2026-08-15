"use client";

import { useEffect, useState } from "react";
import type { Bike, Profile } from "@/lib/account";

export interface Cuenta {
  authAvailable: boolean;
  user: { name: string | null; email: string | null; image: string | null } | null;
  profile?: Profile;
  bikes?: Bike[];
}

/**
 * Estado de la sesion, en una linea.
 *
 * Sin cuentas configuradas no aparece nada: la app funciona igual, y una
 * barra que solo dice "esto no esta disponible" es ruido.
 */
export default function AccountBar({
  cuenta,
  onRecargar,
}: {
  cuenta: Cuenta | null;
  onRecargar: () => void;
}) {
  const [saliendo, setSaliendo] = useState(false);

  if (!cuenta?.authAvailable) return null;

  if (!cuenta.user) {
    return (
      <a
        href="/entrar"
        className="flex items-center gap-2 text-[0.7rem] font-semibold text-[var(--color-faint)] transition-colors hover:text-[var(--color-accent)]"
      >
        Entrar para guardar tus rutas
      </a>
    );
  }

  const nombre = cuenta.user.name || cuenta.user.email || "Tú";
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[0.6rem] font-bold">
        {cuenta.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cuenta.user.image} alt="" className="h-full w-full object-cover" />
        ) : (
          nombre.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.7rem] text-[var(--color-muted)]">
        {nombre}
      </span>
      <button
        type="button"
        disabled={saliendo}
        onClick={async () => {
          setSaliendo(true);
          try {
            // signOut de next-auth v5 desde cliente: POST al endpoint con el
            // token CSRF, sin arrastrar el paquete entero al bundle.
            const csrf = await (await fetch("/api/auth/csrf")).json();
            await fetch("/api/auth/signout", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ csrfToken: csrf.csrfToken, json: "true" }),
            });
            onRecargar();
          } finally {
            setSaliendo(false);
          }
        }}
        className="shrink-0 text-[0.66rem] text-[var(--color-faint)] transition-colors hover:text-[var(--color-ink)]"
      >
        salir
      </button>
    </div>
  );
}

/** Carga la cuenta una vez y deja recargarla tras entrar, salir o guardar. */
export function useCuenta() {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);

  const cargar = async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      setCuenta(await res.json());
    } catch {
      setCuenta({ authAvailable: false, user: null });
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return { cuenta, recargar: cargar };
}
