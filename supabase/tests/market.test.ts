import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

let db: PGlite;
const WINTER_6AM = "2026-11-14T05:00:00Z"; // 06:00 Madrid (UTC+1)
const SUMMER_6AM = "2026-07-01T04:00:00Z"; // 06:00 Madrid (UTC+2)

const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 16); // 3 managers take 9 per color, leaving 7 free per color
});

async function manager(team: string): Promise<string> {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [team]));
  return id;
}
const freePlayer = async (color = "Blanco") =>
  (await q<{ id: string }>(
    "select id from players where color = $1 and id not in (select player_id from squads) and id not in (select player_id from market_listings) order by value desc limit 1",
    [color],
  ))[0].id;
async function openListing(playerId?: string): Promise<string> {
  const player = playerId ?? (await freePlayer());
  return (await q<{ id: string }>(
    "insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day') returning id",
    [player],
  ))[0].id;
}
const bid = (user: string, listing: string, amount: number) =>
  asUser(db, user, () => db.query("select place_bid($1, $2)", [listing, amount]));
const close = async (opts: { force?: boolean; now?: string } = {}) =>
  (await q<{ d: string | null }>("select close_cycle($1, $2::timestamptz)::text as d", [opts.force ?? false, opts.now ?? WINTER_6AM]))[0].d;
const owner = async (listing: string) =>
  (await q<{ user_id: string }>("select s.user_id from squads s join market_listings l on l.player_id = s.player_id where l.id = $1", [listing]))[0]?.user_id;
const budget = async (user: string) => (await q<{ budget: number }>("select budget from profiles where user_id = $1", [user]))[0].budget;

describe("close_cycle: resolving bids", () => {
  test("the highest bid wins, pays its amount and gets the player", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    await bid(b, listing, 1_300_000);
    await close();
    expect(await owner(listing)).toBe(b);
    expect(await budget(b)).toBe(5_000_000 - 1_300_000);
    expect(await budget(a)).toBe(5_000_000);
    expect(await q("select status from market_listings where id = $1", [listing])).toEqual([{ status: "sold" }]);
  });

  test("a tie goes to the earlier bid, whoever has the smaller id", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const first = await openListing();
    await bid(a, first, 1_200_000);
    await bid(b, first, 1_200_000);
    const second = await openListing(await freePlayer("Azul"));
    await bid(b, second, 1_200_000);
    await bid(a, second, 1_200_000);
    await close();
    expect(await owner(first)).toBe(a);
    expect(await owner(second)).toBe(b);
  });

  test("bids with the same timestamp go to the one placed first, not to the smaller id", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    const sameInstant = "2026-11-14T00:00:00Z";
    const insert = (id: string, user: string) =>
      db.query("insert into bids (id, listing_id, user_id, amount, created_at) values ($1, $2, $3, 1200000, $4)", [id, listing, user, sameInstant]);
    await insert("ffffffff-ffff-4fff-8fff-ffffffffffff", a); // placed first, but sorts last by id
    await insert("00000000-0000-4000-8000-000000000000", b);
    await close();
    expect(await owner(listing)).toBe(a);
  });

  test("a winner who can no longer pay is skipped and the next bidder gets the player", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_500_000);
    await bid(b, listing, 1_100_000);
    await db.query("update profiles set budget = 200000 where user_id = $1", [a]); // A spent money elsewhere
    await close();
    expect(await owner(listing)).toBe(b);
    expect(await budget(a)).toBe(200_000);
    expect(await budget(b)).toBe(5_000_000 - 1_100_000);
  });

  test("a listing nobody can pay for expires and the player stays free", async () => {
    const a = await manager("Equipo A");
    const listing = await openListing();
    await bid(a, listing, 1_500_000);
    await db.query("update profiles set budget = 0 where user_id = $1", [a]);
    await close();
    expect(await owner(listing)).toBeUndefined();
    expect(await q("select status from market_listings where id = $1", [listing])).toEqual([{ status: "expired" }]);
  });

  test("one manager winning two listings pays for both and never goes negative", async () => {
    const a = await manager("Equipo A");
    const l1 = await openListing();
    const l2 = await openListing(await freePlayer("Azul"));
    await bid(a, l1, 3_000_000);
    await bid(a, l2, 3_000_000); // each bid fits the 5M budget on its own; both together do not
    await close();
    expect(await budget(a)).toBe(2_000_000);
    expect([await owner(l1), await owner(l2)].filter(Boolean)).toEqual([a]);
    expect(await q("select 1 from profiles where budget < 0")).toEqual([]);
  });
});

describe("close_cycle: when it acts", () => {
  test("outside 06:00 Madrid it does nothing", async () => {
    const [a] = [await manager("Equipo A")];
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    expect(await close({ now: "2026-11-14T10:00:00Z" })).toBeNull();
    expect(await close({ now: "2026-11-14T04:00:00Z" })).toBeNull(); // 05:00 Madrid in winter
    expect(await owner(listing)).toBeUndefined();
    expect(await q("select 1 from cycles")).toEqual([]);
  });

  test("it acts at 06:00 Madrid in winter and in summer, and ignores the other cron firing", async () => {
    expect(await close({ now: WINTER_6AM })).toBe("2026-11-14");
    expect(await close({ now: "2026-11-14T04:00:00Z" })).toBeNull(); // the 04:00 UTC firing in winter
    expect(await close({ now: SUMMER_6AM })).toBe("2026-07-01");
    expect(await close({ now: "2026-07-01T05:00:00Z" })).toBeNull(); // the 05:00 UTC firing in summer
  });

  test("firing twice in the same cycle resolves once", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    expect(await close()).toBe("2026-11-14");
    await bid(b, listing, 9_000_000).catch(() => undefined); // listing is sold: must not be reopened
    expect(await close()).toBeNull();
    expect(await budget(a)).toBe(5_000_000 - 1_100_000);
  });

  test("a forced close runs any time and can be repeated for the demo", async () => {
    expect(await close({ force: true, now: "2026-11-14T10:00:00Z" })).toBe("2026-11-14");
    expect(await close({ force: true, now: "2026-11-14T10:05:00Z" })).toBe("2026-11-14");
    expect(await q("select count(*)::int n from cycles")).toEqual([{ n: 1 }]);
  });
});

describe("close_cycle: what it leaves behind", () => {
  test("snapshots every manager's 8 starters under the cycle date", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await close();
    const rows = await q<{ user_id: string; n: number }>(
      "select user_id, count(*)::int n from lineup_snapshots where cycle_date = '2026-11-14' group by 1",
    );
    expect(rows.sort((x, y) => x.user_id.localeCompare(y.user_id))).toEqual(
      [{ user_id: a, n: 8 }, { user_id: b, n: 8 }].sort((x, y) => x.user_id.localeCompare(y.user_id)),
    );
  });

  test("opens 3 listings per color from free players only, closing at the next 06:00 Madrid", async () => {
    await manager("Equipo A");
    await close();
    const open = await q<{ color: string; closes_at: string; owned: boolean }>(
      `select p.color, to_char(l.closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as closes_at, exists (select 1 from squads s where s.player_id = p.id) as owned
       from market_listings l join players p on p.id = l.player_id where l.status = 'open'`,
    );
    expect(open).toHaveLength(12);
    expect(open.some((r) => r.owned)).toBe(false);
    expect(COLORS.map((c) => open.filter((r) => r.color === c).length)).toEqual([3, 3, 3, 3]);
    expect(new Set(open.map((r) => r.closes_at))).toEqual(new Set(["2026-11-15T05:00:00Z"]));
  });

  test("an unsold player is offered again next cycle without duplicate open listings", async () => {
    await close();
    await close({ now: "2026-11-15T05:00:00Z" });
    const dupes = await q("select player_id from market_listings where status = 'open' group by 1 having count(*) > 1");
    expect(dupes).toEqual([]);
  });
});

describe("place_bid", () => {
  test("rejects a bid below the player's value, above the budget, on a closed listing, or when signed out", async () => {
    const a = await manager("Equipo A");
    const listing = await openListing();
    await expect(bid(a, listing, 100_000)).rejects.toThrow(/below the market value/);
    await expect(bid(a, listing, 6_000_000)).rejects.toThrow(/above your budget/);
    await db.query("update market_listings set status = 'sold' where id = $1", [listing]);
    await expect(bid(a, listing, 1_100_000)).rejects.toThrow(/not open/);
    await expect(db.query("select place_bid($1, 1100000)", [listing])).rejects.toThrow(/not signed in/);
  });

  test("rejects a bid after the listing's closing time", async () => {
    const a = await manager("Equipo A");
    const listing = await openListing();
    await db.query("update market_listings set closes_at = now() - interval '1 minute' where id = $1", [listing]);
    await expect(bid(a, listing, 1_100_000)).rejects.toThrow(/not open/);
  });
});

describe("sell_player", () => {
  const sell = (user: string, player: string) => asUser(db, user, () => db.query("select sell_player($1)", [player]));

  test("pays the current value and frees the player", async () => {
    const a = await manager("Equipo A");
    const bench = (await q<{ id: string; value: number }>(
      `select p.id, p.value from squads s join players p on p.id = s.player_id
       where s.user_id = $1 and p.id not in (select player_id from lineups where user_id = $1) limit 1`, [a]))[0];
    await sell(a, bench.id);
    expect(await budget(a)).toBe(5_000_000 + bench.value);
    expect(await q("select 1 from squads where player_id = $1", [bench.id])).toEqual([]);
  });

  test("selling a starter promotes the best bench player of that color", async () => {
    const a = await manager("Equipo A");
    const starter = (await q<{ id: string }>(
      "select p.id from lineups l join players p on p.id = l.player_id where l.user_id = $1 and p.color = 'Blanco' order by p.value desc limit 1", [a]))[0].id;
    await sell(a, starter);
    const lineup = await q<{ color: string; n: number }>(
      "select p.color, count(*)::int n from lineups l join players p on p.id = l.player_id where l.user_id = $1 group by 1", [a]);
    expect(lineup.map((r) => r.n)).toEqual([2, 2, 2, 2]);
  });

  test("refuses to leave fewer than 2 players of a color, and refuses a player you do not own", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const mine = await q<{ id: string }>(
      "select p.id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Rosa'", [a]);
    await sell(a, mine[0].id); // 3 -> 2 is allowed
    await expect(sell(a, mine[1].id)).rejects.toThrow(/at least 2 players of each color/);
    const theirs = (await q<{ player_id: string }>("select player_id from squads where user_id = $1 limit 1", [b]))[0].player_id;
    await expect(sell(a, theirs)).rejects.toThrow(/not in your squad/);
  });
});

describe("admin_close_market", () => {
  test("only an admin can force a close", async () => {
    const [admin, user] = [await manager("Admin"), await manager("Normal")];
    await db.query("update profiles set is_admin = true where user_id = $1", [admin]);
    await expect(asUser(db, user, () => db.query("select admin_close_market()"))).rejects.toThrow(/admin only/);
    const closed = await asUser(db, admin, async () => (await db.query<{ d: string }>("select admin_close_market()::text as d")).rows[0].d);
    expect(closed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("close_cycle itself is not callable by a signed-in user", async () => {
    const user = await manager("Normal");
    await expect(asUser(db, user, () => db.query("select close_cycle(true)"))).rejects.toThrow(/permission denied/);
  });

  test("a visitor with no session (anon) can call none of the game functions", async () => {
    const calls = ["create_manager('x')", "set_lineup(array[]::uuid[])", "place_bid(gen_random_uuid(), 1)", "sell_player(gen_random_uuid())", "admin_close_market()", "close_cycle(true)"];
    for (const call of calls) {
      await db.exec("set role anon");
      await expect(db.query(`select ${call}`), call).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
});
