import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authAvailable, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar · Viento de los cojones" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = authAvailable ? await auth() : null;
  if (session?.user) redirect("/");

  const conGoogle = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const conCorreo = !!process.env.AUTH_RESEND_KEY;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-sm rounded-2xl p-6">
        <Link
          href="/"
          className="text-[0.7rem] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
        >
          ← Volver al mapa
        </Link>

        <h1 className="mt-3 text-[1.1rem] font-bold tracking-tight">Entrar</h1>
        <p className="mt-1 text-[0.78rem] leading-snug text-[var(--color-muted)]">
          Para llevar tu perfil, tus bicis y tus rutas de un dispositivo a otro.
          Planificar funciona igual sin cuenta.
        </p>

        {params["revisa-el-correo"] && (
          <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-2 text-[0.78rem] leading-snug text-emerald-200/90">
            Te he mandado un enlace. Ábrelo desde este mismo dispositivo.
          </p>
        )}

        {params.error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.78rem] leading-snug text-red-200">
            No ha podido ser. Inténtalo otra vez.
          </p>
        )}

        {!authAvailable ? (
          <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2.5 text-[0.76rem] leading-snug text-amber-200/90">
            Las cuentas todavía no están configuradas en este despliegue. Hace
            falta una base de datos y un proveedor de acceso; está todo escrito y
            esperando las variables de entorno.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {conGoogle && (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/" });
                }}
              >
                <button type="submit" className="btn btn-primary w-full !py-2.5">
                  Entrar con Google
                </button>
              </form>
            )}

            {conGoogle && conCorreo && (
              <div className="flex items-center gap-3 text-[0.68rem] text-[var(--color-faint)]">
                <span className="h-px flex-1 bg-white/10" />o
                <span className="h-px flex-1 bg-white/10" />
              </div>
            )}

            {conCorreo && (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("resend", {
                    email: String(formData.get("email") ?? ""),
                    redirectTo: "/",
                  });
                }}
                className="space-y-2"
              >
                <label className="label block">Tu correo</label>
                <input
                  className="field"
                  type="email"
                  name="email"
                  required
                  placeholder="tu@correo.es"
                  autoComplete="email"
                />
                <button type="submit" className="btn w-full !py-2.5">
                  Mandarme un enlace
                </button>
                <p className="text-[0.66rem] leading-snug text-[var(--color-faint)]">
                  Sin contraseña: recibes un enlace y con eso entras.
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
