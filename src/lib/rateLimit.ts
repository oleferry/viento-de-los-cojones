/**
 * Limitador de peticiones en memoria, por IP.
 *
 * No es un limitador distribuido de verdad: cada instancia de la funcion
 * serverless lleva su propia cuenta, y una instancia fria empieza de cero.
 * Eso esta bien — no se busca una cuota exacta, se busca que un script
 * disparando /api/plan en bucle no agote en minutos el cupo diario de
 * OpenRouteService, que es compartido por todos los que usan la app. Mismo
 * compromiso que el cache de geometrias de routing.ts: oportunista, no
 * fiable, y es justo lo que hace falta.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
const MAX_TRACKED = 5_000;

export interface RateLimitResult {
  limited: boolean;
  /** Segundos hasta que se pueda volver a intentar. */
  retryAfterS: number;
}

/**
 * `limit` peticiones cada `windowMs` milisegundos, por clave (normalmente la IP).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Poda oportunista: si el mapa crece demasiado (muchas IPs distintas en
  // poco tiempo, tipico de un scraneo), se vacia entero en vez de iterar
  // buscando que borrar. Perder el conteo de vez en cuando no es grave.
  if (buckets.size > MAX_TRACKED) buckets.clear();

  const w = buckets.get(key);
  if (!w || now >= w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterS: 0 };
  }

  w.count++;
  if (w.count > limit) {
    return { limited: true, retryAfterS: Math.ceil((w.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfterS: 0 };
}

/** IP del cliente tras el proxy de Vercel. "desconocida" agrupa lo que no venga. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}
