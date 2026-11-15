import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { buildNotification, type OutboxRow } from "@/services/notifications";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

// Weeks are Monday to Sunday. 2026-11-02 and 2026-11-09 are Mondays; the cycle date follows 06:00 Madrid.
const WEEK1 = "2026-11-02";
const WEEK2 = "2026-11-09";

async function team(name: string) {
  const user = await addUser(db);
  await asUser(db, user, () => db.query("select create_manager($1)", [name]));
  return user;
}
/** A starter of `user` scores `points` in a match played on `cycle` (a snapshot is taken first so it counts). */
async function score(user: string, cycle: string, points: number) {
  await db.query("select close_cycle(true, $1::timestamptz)", [`${cycle}T06:30:00+01:00`]);
  const player = (await q<{ id: string }>("select player_id id from lineups where user_id = $1 limit 1", [user]))[0].id;
  const match = (await q<{ id: string }>("insert into ptg_matches (ptg_match_id, played_at, club) values (gen_random_uuid(), $1::timestamptz, 'Club') returning id", [`${cycle}T12:00:00+01:00`]))[0].id;
  await db.query("insert into match_players (match_id, player_id, won, sets_won, sets_lost, points) values ($1, $2, true, 2, 0, $3)", [match, player, points]);
}
const inbox = async () => q<OutboxRow & { data: Record<string, unknown> }>("select id::int, user_id, kind, data from notification_outbox where kind = 'jornada_closed' order by user_id");

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 16);
  await db.exec("alter table notification_outbox disable trigger all");
});

describe("announce_closed_jornadas", () => {
  test("tells every team its points, week place, overall place and movement once the week is over", async () => {
    const [a, b, c] = [await team("Equipo A"), await team("Equipo B"), await team("Equipo C")];
    await score(a, "2026-11-03", 30); await score(b, "2026-11-03", 10); // week 1: A leads
    await score(b, "2026-11-10", 40); await score(a, "2026-11-11", 5); // week 2: B wins and overtakes
    const sent = (await q<{ n: number }>("select announce_closed_jornadas('2026-11-16T09:00:00Z')::int n"))[0].n;
    expect(sent).toBe(3);
    const by = Object.fromEntries((await inbox()).map((r) => [r.user_id, r.data]));
    expect(by[b]).toMatchObject({ week_start: WEEK2, points: 40, rank: 1, teams: 3, overall_rank: 1, delta: 1, winner: "Equipo B", winner_points: 40 });
    expect(by[a]).toMatchObject({ points: 5, rank: 2, overall_rank: 2, delta: -1 });
    expect(by[c]).toMatchObject({ points: 0, rank: 3, overall_rank: 3 });
    expect(buildNotification({ id: 1, user_id: b, kind: "jornada_closed", data: by[b] }).url).toBe(`/jornada?semana=${WEEK2}`);
  });

  test("announces a week once, and only after it is over", async () => {
    const a = await team("Equipo A");
    await score(a, "2026-11-10", 12);
    expect((await q<{ n: number }>("select announce_closed_jornadas('2026-11-15T10:00:00Z')::int n"))[0].n).toBe(0); // Sunday: still running
    expect((await q<{ n: number }>("select announce_closed_jornadas('2026-11-16T10:00:00Z')::int n"))[0].n).toBe(1);
    expect((await q<{ n: number }>("select announce_closed_jornadas('2026-11-16T11:00:00Z')::int n"))[0].n).toBe(0);
    expect(await inbox()).toHaveLength(1);
  });

  test("a backlog of older weeks is marked, not sent", async () => {
    const a = await team("Equipo A");
    await score(a, "2026-11-03", 9); await score(a, "2026-11-10", 12);
    await db.query("select announce_closed_jornadas('2026-11-17T10:00:00Z')");
    expect((await inbox()).map((r) => r.data.week_start)).toEqual([WEEK2]);
    expect((await q<{ w: string }>("select week_start::text w from jornada_announcements order by 1")).map((r) => r.w)).toEqual([WEEK1, WEEK2]);
  });

  test("a signed-in user cannot call it", async () => {
    const a = await team("Equipo A");
    await expect(asUser(db, a, () => db.query("select announce_closed_jornadas()"))).rejects.toThrow(/permission denied/);
  });
});
