-- Esquema de "Viento de los cojones".
-- Se aplica solo con: npm run db:setup
-- Es idempotente: se puede ejecutar las veces que haga falta.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- Auth.js --
-- Estas cuatro tablas las exige @auth/pg-adapter y su forma no es negociable.

create table if not exists users (
  id uuid not null default gen_random_uuid(),
  name varchar(255),
  email varchar(255),
  "emailVerified" timestamptz,
  image text,
  primary key (id)
);

create table if not exists accounts (
  id serial,
  "userId" uuid not null references users(id) on delete cascade,
  type varchar(255) not null,
  provider varchar(255) not null,
  "providerAccountId" varchar(255) not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  primary key (id)
);

create table if not exists sessions (
  id serial,
  "userId" uuid not null references users(id) on delete cascade,
  expires timestamptz not null,
  "sessionToken" varchar(255) not null,
  primary key (id)
);

create table if not exists verification_token (
  identifier text not null,
  expires timestamptz not null,
  token text not null,
  primary key (identifier, token)
);

-- ------------------------------------------------------------ la aplicacion --

-- El cuerpo y el motor: no dependen de que bici cojas hoy.
create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  height_cm smallint not null default 178,
  mass_kg numeric(5,1) not null default 75,
  ftp_w smallint not null default 240,
  intensity numeric(3,2) not null default 0.72,
  position text not null default 'hoods',
  updated_at timestamptz not null default now()
);

-- Varias bicis por persona: la de carretera y la de gravel tienen CdA y Crr
-- muy distintos, y no tiene sentido reescribir el perfil cada vez.
create table if not exists bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  frame text not null default 'aero-allround',
  wheels text not null default 'd45',
  tyres text not null default 'race-tl',
  clothing text not null default 'tight',
  helmet text not null default 'road',
  luggage text not null default 'small',
  bike_kg numeric(4,1) not null default 8.5,
  extra_kg numeric(4,1) not null default 1.5,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists bikes_user_idx on bikes (user_id);

-- Solo una bici por defecto y por persona.
create unique index if not exists bikes_one_default
  on bikes (user_id) where is_default;

-- Rutas guardadas: las trazadas por la app y los GPX que sube la gente.
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('planned', 'imported')),
  distance_m integer not null,
  ascent_m integer,
  -- La geometria va como jsonb: son unos miles de pares y no se consulta por
  -- dentro, solo se devuelve entera para volver a simularla con otro viento.
  coords jsonb not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists routes_user_idx on routes (user_id, created_at desc);
