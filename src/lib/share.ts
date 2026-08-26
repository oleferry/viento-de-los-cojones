import { randomBytes } from "node:crypto";
import { query } from "./db";

/**
 * Rutas compartidas por enlace.
 *
 * Se puede compartir SIN cuenta, que es la diferencia con `routes`: aqui se
 * guarda una copia congelada de la geometria para que quien reciba el enlace
 * vea exactamente el mismo trazado. El enlace de siempre (el de parametros)
 * solo compartia la BUSQUEDA, y quien lo abria podia acabar con otra ruta
 * distinta porque el viento habia cambiado.
 */
export interface Share {
  id: string;
  name: string;
  coords: number[][];
  distanceM: number;
  ascentM: number | null;
  surface: string;
  windMode: string;
  createdAt: string;
}

/**
 * Token corto y no adivinable. 12 caracteres de base64url son 72 bits: de
 * sobra para que nadie lo acierte a fuerza de probar, y sigue cabiendo comodo
 * en un mensaje.
 */
function nuevoId(): string {
  return randomBytes(9).toString("base64url");
}

export async function createShare(r: {
  name: string;
  coords: number[][];
  distanceM: number;
  ascentM?: number | null;
  surface?: string;
  windMode?: string;
  userId?: string | null;
}): Promise<string> {
  const id = nuevoId();
  await query(
    `insert into shares (id, name, coords, distance_m, ascent_m, surface, wind_mode, user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      r.name.slice(0, 120),
      JSON.stringify(r.coords),
      Math.round(r.distanceM),
      r.ascentM == null ? null : Math.round(r.ascentM),
      r.surface ?? "carretera",
      r.windMode ?? "tailwind_home",
      r.userId ?? null,
    ]
  );
  return id;
}

export async function getShare(id: string): Promise<Share | null> {
  const rows = await query<Record<string, unknown>>(
    `select id, name, coords, distance_m, ascent_m, surface, wind_mode, created_at
       from shares where id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const s = rows[0];
  return {
    id: String(s.id),
    name: String(s.name),
    coords: s.coords as number[][],
    distanceM: Number(s.distance_m),
    ascentM: s.ascent_m == null ? null : Number(s.ascent_m),
    surface: String(s.surface ?? "carretera"),
    windMode: String(s.wind_mode ?? "tailwind_home"),
    createdAt: new Date(s.created_at as string).toISOString(),
  };
}
