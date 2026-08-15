import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import PostgresAdapter from "@auth/pg-adapter";
import { db, dbEnabled } from "./db";

/**
 * Los proveedores se encienden solos segun las credenciales que existan.
 *
 * Ninguno hace falta para planificar una ruta: sin base de datos ni proveedor,
 * la app funciona igual y guarda el perfil en el navegador. La cuenta anade
 * poder usarla desde el movil y desde el ordenador con lo mismo, no es un
 * peaje de entrada.
 */
function providers() {
  const list: NextAuthConfig["providers"] = [];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      })
    );
  }
  if (process.env.AUTH_RESEND_KEY) {
    list.push(
      Resend({
        apiKey: process.env.AUTH_RESEND_KEY,
        from: process.env.AUTH_EMAIL_FROM || "no-reply@resend.dev",
      })
    );
  }
  return list;
}

export const authAvailable = dbEnabled && providers().length > 0;

const config: NextAuthConfig = {
  // El adaptador solo se monta si hay base de datos: sin ella no hay donde
  // guardar sesiones y NextAuth reventaria al arrancar.
  ...(dbEnabled ? { adapter: PostgresAdapter(db()) } : {}),
  providers: providers(),
  session: { strategy: dbEnabled ? "database" : "jwt" },
  pages: { signIn: "/entrar", verifyRequest: "/entrar?revisa-el-correo=1" },
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      if (user?.id) session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

/** Id de la persona conectada, o null. Es el guardian de toda la API privada. */
export async function currentUserId(): Promise<string | null> {
  if (!authAvailable) return null;
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}
