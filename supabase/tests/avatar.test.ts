import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

// profiles.avatar_url is the only account-derived value shared with other participants.

let db: PGlite;
let a: string;
let b: string;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const GOOD = "https://lh3.googleusercontent.com/a/ACg8oc=s96-c";
const avatarOf = async (user: string) => (await q<{ avatar_url: string | null }>("select avatar_url from profiles where user_id = $1", [user]))[0].avatar_url;
const setAvatar = (user: string, url: string | null) => asUser(db, user, () => db.query("select set_my_avatar($1)", [url]));

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
  a = await addUser(db);
  b = await addUser(db);
  await asUser(db, a, () => db.query("select create_manager('Alfa')"));
  await asUser(db, b, () => db.query("select create_manager('Beta')"));
});

describe("set_my_avatar", () => {
  test("a team starts without photo", async () => expect(await avatarOf(a)).toBeNull());

  test("stores a Google photo URL on the caller's own profile only", async () => {
    await setAvatar(a, GOOD);
    expect(await avatarOf(a)).toBe(GOOD);
    expect(await avatarOf(b)).toBeNull();
  });

  test("another participant can read it (that is the point) through the existing profiles read policy", async () => {
    await setAvatar(a, GOOD);
    const seen = await asUser(db, b, () => q<{ avatar_url: string | null }>("select avatar_url from profiles where user_id = $1", [a]));
    expect(seen).toEqual([{ avatar_url: GOOD }]);
  });

  test.each([
    ["http (not https)", "http://lh3.googleusercontent.com/a/x"],
    ["another host", "https://evil.example/pixel.png"],
    ["a look-alike host", "https://googleusercontent.com.evil.example/x"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/png;base64,AAAA"],
    ["whitespace inside", "https://lh3.googleusercontent.com/a/x y"],
    ["over 500 characters", `https://lh3.googleusercontent.com/${"x".repeat(500)}`],
    ["empty", ""],
  ])("%s clears the photo instead of storing it", async (_name, url) => {
    await setAvatar(a, GOOD);
    await setAvatar(a, url);
    expect(await avatarOf(a)).toBeNull();
  });

  test("null clears it", async () => {
    await setAvatar(a, GOOD);
    await setAvatar(a, null);
    expect(await avatarOf(a)).toBeNull();
  });

  test("the table itself refuses a bad value even for the service role (CHECK)", async () => {
    await expect(db.query("update profiles set avatar_url = 'https://evil.example/x' where user_id = $1", [a])).rejects.toThrow(/avatar_url/);
  });

  test("a signed-in user cannot write the column directly", async () => {
    await asUser(db, a, async () => {
      const r = await db.query("update profiles set avatar_url = $1 where user_id = $2", [GOOD, a]).then(() => "ok", () => "denied");
      expect(r === "denied" || (await avatarOf(a)) === null).toBe(true);
    });
  });

  test("visitors cannot call it", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select set_my_avatar($1)", [GOOD])).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("what profiles exposes", () => {
  test("the columns are the reviewed ones plus avatar_url, and none looks like account data", async () => {
    const cols = await q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["avatar_url", "budget", "created_at", "is_admin", "team_name", "user_id"]);
    const risky = await q(`select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name ~* '(mail|phone|token|password|secret)'`);
    expect(risky).toEqual([]);
  });
});
