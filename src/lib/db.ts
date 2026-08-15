import { Pool } from "pg";

/**
 * Conexion a Postgres.
 *
 * TODO lo que hay debajo es opcional a proposito: sin `DATABASE_URL` la app
 * sigue funcionando exactamente igual que antes, guardando el perfil en el
 * navegador. Las cuentas anaden persistencia entre dispositivos, no son un
 * requisito para planificar una ruta, y no tendria sentido que un despliegue
 * sin base de datos se cayera entero.
 */
const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

export const dbEnabled = !!url;

declare global {
  // eslint-disable-next-line no-var
  var __vdcPool: Pool | undefined;
}

/**
 * El pool se guarda en global: en serverless el modulo se reevalua entre
 * invocaciones de la misma instancia, y sin esto se abriria una conexion nueva
 * cada vez hasta agotar el limite del servidor.
 */
export function db(): Pool {
  if (!url) throw new Error("No hay base de datos configurada");
  if (!globalThis.__vdcPool) {
    globalThis.__vdcPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Los Postgres gestionados (Vercel, Neon, Supabase) exigen TLS pero
      // presentan certificados que el almacen por defecto de Node no valida.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
  }
  return globalThis.__vdcPool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await db().query(text, params as never[]);
  return res.rows as T[];
}
