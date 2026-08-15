/**
 * Aplica el esquema a la base de datos.
 *
 *   npm run db:setup
 *
 * Lee DATABASE_URL (o POSTGRES_URL) de .env.local, que es lo que deja
 * `vercel env pull`. Es idempotente: se puede repetir sin miedo.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

// Carga minima de .env.local, para no arrastrar dotenv solo por esto.
try {
  const env = await readFile(join(process.cwd(), ".env.local"), "utf8");
  for (const linea of env.split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* sin .env.local: se usan las variables del entorno */
}

const url =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

if (!url) {
  console.error(`
No hay base de datos configurada.

  1. En Vercel: Storage -> Create Database -> Postgres, y conectala al proyecto.
  2. Aqui: npx vercel env pull .env.local
  3. Y otra vez: npm run db:setup
`);
  process.exit(1);
}

const sql = await readFile(join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  console.log("Esquema aplicado. Tablas:");
  for (const r of rows) console.log("  - " + r.table_name);
} finally {
  await client.end();
}
