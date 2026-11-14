import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/** The slice of Supabase our SQL relies on: auth.users, auth.uid() and the authenticated role. */
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  grant usage on schema public, auth to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
`;

export const COLORS = ["Blanco", "Azul", "Verde", "Rosa"] as const;

/** A throwaway Postgres with every migration applied, in file order. */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
  }
  return db;
}

/** `perColor` players in each of the four colors; values fall with the index so "best" is well defined. */
export async function seedPlayers(db: PGlite, perColor = 8): Promise<void> {
  for (const color of COLORS) {
    for (let i = 0; i < perColor; i++) {
      await db.query(
        `insert into players (ptg_player_id, display_name, color, group_id, matches_played, ratio, value)
         values ($1, $2, $3, $4, 20, 0.5, $5)`,
        [randomUUID(), `${color} ${i}`, color, randomUUID(), 1_000_000 - i * 10_000],
      );
    }
  }
}

export async function addUser(db: PGlite): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  return id;
}

/** Runs `fn` as an authenticated Supabase user, so RLS applies. Always switches back. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}
