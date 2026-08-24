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
  surface: string;
  windMode: string;
  /** Si se avisa por correo cuando aparezca una buena ventana de viento. */
  notify: boolean;
  notifiedAt: string | null;
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
  surface: String(r.surface ?? "carretera"),
  windMode: String(r.wind_mode ?? "tailwind_home"),
  notify: Boolean(r.notify),
  notifiedAt: r.notified_at ? new Date(r.notified_at as string).toISOString() : null,
  ...(conCoords ? { coords: r.coords as number[][], meta: r.meta as never } : {}),
});

export async function listRoutes(userId: string): Promise<SavedRoute[]> {
  // Sin `coords`: son miles de pares por ruta y el listado no los necesita.
  const rows = await query<Record<string, unknown>>(
    `select id, name, kind, distance_m, ascent_m, created_at, surface, wind_mode, notify, notified_at
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
    surface?: string;
    windMode?: string;
    meta?: Record<string, unknown>;
  }
): Promise<SavedRoute> {
  const rows = await query<Record<string, unknown>>(
    `insert into routes (user_id, name, kind, distance_m, ascent_m, coords, meta, surface, wind_mode)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [
      userId,
      r.name.slice(0, 120),
      r.kind,
      Math.round(r.distanceM),
      r.ascentM == null ? null : Math.round(r.ascentM),
      JSON.stringify(r.coords),
      JSON.stringify(r.meta ?? {}),
      r.surface ?? "carretera",
      r.windMode ?? "tailwind_home",
    ]
  );
  return routeFromRow(rows[0], true);
}

export async function deleteRoute(userId: string, id: string): Promise<void> {
  await query(`delete from routes where id = $1 and user_id = $2`, [id, userId]);
}

/**
 * Activa o desactiva el aviso por correo para una ruta guardada.
 *
 * De paso anota el idioma: encender el aviso es el unico momento en el que
 * sabemos con certeza que esta persona va a recibir correo nuestro, asi que es
 * cuando toca acordarse de en que lengua escribirselo.
 */
export async function setRouteNotify(
  userId: string,
  id: string,
  notify: boolean,
  locale?: string
): Promise<void> {
  await query(
    `update routes set notify = $3, notified_at = case when $3 then notified_at else null end
       where id = $1 and user_id = $2`,
    [id, userId, notify]
  );
  if (notify && locale) {
    await query(`update users set locale = $2 where id = $1`, [userId, locale]);
  }
}

/**
 * Todas las rutas con aviso activado, de cualquier usuario, con lo que hace
 * falta para recalcular su pronostico: geometria, perfil y bici. Solo la usa
 * el trabajo en segundo plano — nunca un endpoint que toque una sesion de
 * usuario, porque cruza datos de todo el mundo a la vez.
 */
export interface NotifyCandidate {
  routeId: string;
  userId: string;
  userEmail: string;
  routeName: string;
  coords: number[][];
  surface: string;
  windMode: string;
  /** Idioma en el que escribirle el correo. */
  locale: string;
  notifiedAt: string | null;
  profile: Profile;
  bike: Bike | null;
}

export async function listNotifyCandidates(): Promise<NotifyCandidate[]> {
  const rows = await query<Record<string, unknown>>(
    `select
       r.id as route_id, r.user_id, r.name as route_name, r.coords,
       r.surface, r.wind_mode, r.notified_at,
       u.email, u.locale,
       p.height_cm, p.mass_kg, p.ftp_w, p.intensity, p.position,
       b.id as bike_id, b.name as bike_name, b.frame, b.wheels, b.tyres,
       b.clothing, b.helmet, b.luggage, b.bike_kg, b.extra_kg, b.is_default
     from routes r
     join users u on u.id = r.user_id
     left join profiles p on p.user_id = r.user_id
     left join bikes b on b.user_id = r.user_id and b.is_default
     where r.notify
       and u.email is not null
       and (r.notified_at is null or r.notified_at < now() - interval '4 days')`
  );
  return rows
    .filter((r) => r.email)
    .map((r) => ({
      routeId: String(r.route_id),
      userId: String(r.user_id),
      userEmail: String(r.email),
      routeName: String(r.route_name),
      coords: r.coords as number[][],
      surface: String(r.surface ?? "carretera"),
      windMode: String(r.wind_mode ?? "tailwind_home"),
      locale: String(r.locale ?? "es"),
      notifiedAt: r.notified_at ? new Date(r.notified_at as string).toISOString() : null,
      profile: r.height_cm == null
        ? { ...DEFAULT_PROFILE }
        : {
            heightCm: Number(r.height_cm),
            massKg: Number(r.mass_kg),
            ftpW: Number(r.ftp_w),
            intensity: Number(r.intensity),
            position: String(r.position),
          },
      bike:
        r.bike_id == null
          ? null
          : bikeFromRow({
              id: r.bike_id,
              name: r.bike_name,
              frame: r.frame,
              wheels: r.wheels,
              tyres: r.tyres,
              clothing: r.clothing,
              helmet: r.helmet,
              luggage: r.luggage,
              bike_kg: r.bike_kg,
              extra_kg: r.extra_kg,
              is_default: r.is_default,
            }),
    }));
}

/** Marca una ruta como avisada ahora mismo. */
export async function markNotified(routeId: string): Promise<void> {
  await query(`update routes set notified_at = now() where id = $1`, [routeId]);
}
