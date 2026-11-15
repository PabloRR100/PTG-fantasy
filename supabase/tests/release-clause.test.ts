import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { clausePrice } from "@/services/clause";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function team(name: string) {
  const user = await addUser(db);
  await asUser(db, user, () => db.query("select create_manager($1)", [name]));
  return user;
}
const pay = (user: string, player: string, price: number) => asUser(db, user, () => db.query("select pay_release_clause($1, $2)", [player, price]));
const squadOf = (user: string) => q<{ id: string; value: number; level: string; starter: boolean }>(
  `select p.id, p.value, gc.group_name level, exists(select 1 from lineups l where l.user_id = s.user_id and l.player_id = p.id) starter
   from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color where s.user_id = $1 order by p.value desc`, [user]);

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 30);
  await db.exec("alter table notification_outbox disable trigger all");
});

describe("pay_release_clause", () => {
  test("moves the player, pays the seller twice his value, keeps the seller's lineup valid and leaves a feed row and a notice", async () => {
    const [buyer, seller] = [await team("Comprador"), await team("Vendedor")];
    const target = (await squadOf(seller)).find((p) => p.starter)!;
    const price = clausePrice(target.value);
    const [b0, s0] = [(await q<{ budget: number }>("select budget from profiles where user_id = $1", [buyer]))[0].budget, (await q<{ budget: number }>("select budget from profiles where user_id = $1", [seller]))[0].budget];

    await pay(buyer, target.id, price);

    expect((await q("select user_id from squads where player_id = $1", [target.id]))[0]).toEqual({ user_id: buyer });
    expect((await q<{ budget: number }>("select budget from profiles where user_id = $1", [buyer]))[0].budget).toBe(b0 - price);
    expect((await q<{ budget: number }>("select budget from profiles where user_id = $1", [seller]))[0].budget).toBe(s0 + price);
    const after = await squadOf(seller);
    expect(after).toHaveLength(26);
    expect(after.filter((p) => p.starter)).toHaveLength(18); // 2 per level still
    expect((await squadOf(buyer)).find((p) => p.id === target.id)!.starter).toBe(false); // arrives on the bench
    expect(await q("select kind, amount from activity where player_id = $1", [target.id])).toEqual([{ kind: "clause", amount: price }]);
    expect(await q("select user_id, kind, data->>'buyer' b from notification_outbox where kind = 'clause_taken'")).toEqual([{ user_id: seller, kind: "clause_taken", b: "Comprador" }]);
  });

  test("refuses your own player, a free player, a wrong price and a missing balance", async () => {
    const [buyer, seller] = [await team("Comprador"), await team("Vendedor")];
    const theirs = (await squadOf(seller))[0];
    const mine = (await squadOf(buyer))[0];
    await expect(pay(buyer, mine.id, clausePrice(mine.value))).rejects.toThrow(/clause unavailable/);
    const free = (await q<{ id: string }>("select id from players where id not in (select player_id from squads) limit 1"))[0].id;
    await expect(pay(buyer, free, 1)).rejects.toThrow(/clause unavailable/);
    await expect(pay(buyer, theirs.id, clausePrice(theirs.value) - 1)).rejects.toThrow(/clause price changed/);
    await db.query("update profiles set budget = 10 where user_id = $1", [buyer]);
    await expect(pay(buyer, theirs.id, clausePrice(theirs.value))).rejects.toThrow(/clause insufficient budget/);
    expect(await q("select 1 from squads where player_id = $1 and user_id = $2", [theirs.id, seller])).toHaveLength(1);
  });

  test("a team cannot be left with fewer than 2 players of a level", async () => {
    const [buyer, seller] = [await team("Comprador"), await team("Vendedor")];
    const players = await squadOf(seller);
    const level = players[0].level;
    const ofLevel = players.filter((p) => p.level === level);
    await pay(buyer, ofLevel[0].id, clausePrice(ofLevel[0].value)); // 3 -> 2
    await expect(pay(buyer, ofLevel[1].id, clausePrice(ofLevel[1].value))).rejects.toThrow(/clause squad minimum/);
  });

  test("anonymous callers cannot use it and the old three-argument version is gone", async () => {
    expect(await q("select 1 from pg_proc where proname = 'pay_release_clause' and pronargs = 3")).toEqual([]);
    const seller = await team("Vendedor");
    const target = (await squadOf(seller))[0];
    await expect(db.query("select pay_release_clause($1, $2)", [target.id, clausePrice(target.value)])).rejects.toThrow(/not signed in/);
  });
});
