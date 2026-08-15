import { query } from "./db";
import { DEFAULT_SETUP, type RiderSetup } from "./equipment";

/** El cuerpo y el motor: no dependen de que bici cojas hoy. */
export interface Profile {
  heightCm: number;
  massKg: number;
  ftpW: number;
  intensity: number;
  position: string;
}

export interface Bike {
  id: string;
  name: string;
  frame: string;
  wheels: string;
  tyres: string;
  clothing: string;
  helmet: string;
  luggage: string;
  bikeKg: number;
  extraKg: number;
  isDefault: boolean;
}

export interface SavedRoute {
  id: string;
  name: string;
  kind: "planned" | "imported";
  distanceM: number;
  ascentM: number | null;
  createdAt: string;
  /** Solo al pedir una ruta concreta; en el listado va vacio por tamano. */
  coords?: number[][];
  meta?: Record<string, unknown> | null;
}

export const DEFAULT_PROFILE: Profile = {
  heightCm: DEFAULT_SETUP.heightCm,
  massKg: DEFAULT_SETUP.massKg,
  ftpW: DEFAULT_SETUP.ftpW,
  intensity: DEFAULT_SETUP.intensity,
  position: DEFAULT_SETUP.position,
};

/** Junta perfil y bici en el `RiderSetup` que ya entiende el motor. */
export function toSetup(profile: Profile, bike: Bike | null): RiderSetup {
  return {
    ...DEFAULT_SETUP,
    heightCm: profile.heightCm,
    massKg: profile.massKg,
    ftpW: profile.ftpW,
    intensity: profile.intensity,
    position: profile.position,
    ...(bike
      ? {
          frame: bike.frame,
          wheels: bike.wheels,
          tyres: bike.tyres,
          clothing: bike.clothing,
          helmet: bike.helmet,
          luggage: bike.luggage,
          bikeKg: bike.bikeKg,
          extraKg: bike.extraKg,
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ perfil */

export async function getProfile(userId: string): Promise<Profile> {
  const rows = await query<Record<string, unknown>>(
    `select height_cm, mass_kg, ftp_w, intensity, position
       from profiles where user_id = $1`,
    [userId]
  );
  if (!rows.length) return { ...DEFAULT_PROFILE };
  const r = rows[0];
  return {
    heightCm: Number(r.height_cm),
    massKg: Number(r.mass_kg),
    ftpW: Number(r.ftp_w),
    intensity: Number(r.intensity),
    position: String(r.position),
  };
}

export async function saveProfile(userId: string, p: Profile): Promise<Profile> {
  await query(
    `insert into profiles (user_id, height_cm, mass_kg, ftp_w, intensity, position, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_id) do update set
       height_cm = excluded.height_cm,
       mass_kg   = excluded.mass_kg,
       ftp_w     = excluded.ftp_w,
       intensity = excluded.intensity,
       position  = excluded.position,
       updated_at = now()`,
    [userId, p.heightCm, p.massKg, p.ftpW, p.intensity, p.position]
  );
  return p;
}

/* ------------------------------------------------------------------- bicis */

const bikeFromRow = (r: Record<string, unknown>): Bike => ({
  id: String(r.id),
  name: String(r.name),
  frame: String(r.frame),
  wheels: String(r.wheels),
  tyres: String(r.tyres),
  clothing: String(r.clothing),
  helmet: String(r.helmet),
  luggage: String(r.luggage),
  bikeKg: Number(r.bike_kg),
  extraKg: Number(r.extra_kg),
  isDefault: Boolean(r.is_default),
});

export async function listBikes(userId: string): Promise<Bike[]> {
  const rows = await query<Record<string, unknown>>(
    `select * from bikes where user_id = $1 order by is_default desc, created_at`,
    [userId]
  );
  return rows.map(bikeFromRow);
}

export async function saveBike(
  userId: string,
  bike: Partial<Bike> & { name: string }
): Promise<Bike> {
  const b = { ...DEFAULT_SETUP, ...bike };
  const campos = [
    bike.name.slice(0, 60),
    b.frame,
    b.wheels,
    b.tyres,
    b.clothing,
    b.helmet,
    b.luggage,
    b.bikeKg,
    b.extraKg,
  ];

  const rows = bike.id
    ? await query<Record<string, unknown>>(
        `update bikes set name=$3, frame=$4, wheels=$5, tyres=$6, clothing=$7,
                          helmet=$8, luggage=$9, bike_kg=$10, extra_kg=$11
         where id = $1 and user_id = $2 returning *`,
        [bike.id, userId, ...campos]
      )
    : await query<Record<string, unknown>>(
        `insert into bikes (user_id, name, frame, wheels, tyres, clothing, helmet,
                            luggage, bike_kg, extra_kg, is_default)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 not exists (select 1 from bikes where user_id = $1))
         returning *`,
        [userId, ...campos]
      );

  if (!rows.length) throw new Error("Esa bici no existe");
  return bikeFromRow(rows[0]);
}

export async function setDefaultBike(userId: string, bikeId: string): Promise<void> {
  // El indice unico parcial impide dos por defecto, asi que hay que soltar la
  // anterior antes de marcar la nueva.
  await query(`update bikes set is_default = false where user_id = $1`, [userId]);
  await query(`update bikes set is_default = true where id = $1 and user_id = $2`, [
    bikeId,
    userId,
  ]);
}

export async function deleteBike(userId: string, bikeId: string): Promise<void> {
  await query(`delete from bikes where id = $1 and user_id = $2`, [bikeId, userId]);
}

/* ------------------------------------------------------------------- rutas */

const routeFromRow = (r: Record<string, unknown>, conCoords: boolean): SavedRoute => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind === "imported" ? "imported" : "planned",
  distanceM: Number(r.distance_m),
  ascentM: r.ascent_m == null ? null : Number(r.ascent_m),
  createdAt: new Date(r.created_at as string).toISOString(),
  ...(conCoords ? { coords: r.coords as number[][], meta: r.meta as never } : {}),
});

export async function listRoutes(userId: string): Promise<SavedRoute[]> {
  // Sin `coords`: son miles de pares por ruta y el listado no los necesita.
  const rows = await query<Record<string, unknown>>(
    `select id, name, kind, distance_m, ascent_m, created_at
       from routes where user_id = $1 order by created_at desc limit 100`,
    [userId]
  );
  return rows.map((r) => routeFromRow(r, false));
}

export async function getRoute(userId: string, id: string): Promise<SavedRoute | null> {
  const rows = await query<Record<string, unknown>>(
    `select * from routes where id = $1 and user_id = $2`,
    [id, userId]
  );
  return rows.length ? routeFromRow(rows[0], true) : null;
}

export async function saveRoute(
  userId: string,
  r: {
    name: string;
    kind: "planned" | "imported";
    distanceM: number;
    ascentM?: number | null;
    coords: number[][];
    meta?: Record<string, unknown>;
  }
): Promise<SavedRoute> {
  const rows = await query<Record<string, unknown>>(
    `insert into routes (user_id, name, kind, distance_m, ascent_m, coords, meta)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [
      userId,
      r.name.slice(0, 120),
      r.kind,
      Math.round(r.distanceM),
      r.ascentM == null ? null : Math.round(r.ascentM),
      JSON.stringify(r.coords),
      JSON.stringify(r.meta ?? {}),
    ]
  );
  return routeFromRow(rows[0], true);
}

export async function deleteRoute(userId: string, id: string): Promise<void> {
  await query(`delete from routes where id = $1 and user_id = $2`, [id, userId]);
}
