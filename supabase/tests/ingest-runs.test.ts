import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./db";

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const record = (run: Record<string, unknown>, at: string) => db.query("select record_ingest_run($1::jsonb, $2::timestamptz)", [JSON.stringify(run), at]);
const ranToday = async (at: string) => (await q<{ r: boolean }>("select ingest_ran_today($1::timestamptz) r", [at]))[0].r;

const OK = { machine: "mini", status: "ok", matches_seen: 40, matches_finished: 31, results_written: 124, players_skipped: 3 };
const FAILED = { machine: "m5", status: "failed", step: "scrape", error: "PTG answered 200 at /login (logged out?)" };

beforeEach(async () => {
  db = await freshDb();
});

describe("record_ingest_run", () => {
  test("keeps what a successful run did, when and on which machine", async () => {
    await record(OK, "2026-11-23T08:00:00Z");
    const rows = await q<Record<string, unknown>>("select machine, status, matches_seen, matches_finished, results_written, players_skipped, ran_at from ingest_runs");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ machine: "mini", status: "ok", matches_seen: 40, matches_finished: 31, results_written: 124, players_skipped: 3 });
    expect(new Date(rows[0].ran_at as string).toISOString()).toBe("2026-11-23T08:00:00.000Z");
  });

  test("keeps the step and the reason of a failed run", async () => {
    await record(FAILED, "2026-11-23T08:00:00Z");
    const [row] = await q<{ status: string; step: string; error: string }>("select status, step, error from ingest_runs");
    expect(row).toEqual({ status: "failed", step: "scrape", error: "PTG answered 200 at /login (logged out?)" });
  });

  test("refuses a failed run that says neither where nor why, and a status it does not know", async () => {
    await expect(record({ machine: "mini", status: "failed" }, "2026-11-23T08:00:00Z")).rejects.toThrow(/ingest_runs/);
    await expect(record({ machine: "mini", status: "weird" }, "2026-11-23T08:00:00Z")).rejects.toThrow(/ingest_runs/);
  });

  test("is for the service role only: managers cannot write or read the log", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select record_ingest_run('{}'::jsonb)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select ingest_ran_today()")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from ingest_runs")).rejects.toThrow(/permission denied|row-level security/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("ingest_ran_today (the fallback machine asks before it runs)", () => {
  test("is false with no runs and false when today only has failures", async () => {
    expect(await ranToday("2026-11-23T12:00:00Z")).toBe(false);
    await record(FAILED, "2026-11-23T08:00:00Z");
    expect(await ranToday("2026-11-23T12:00:00Z")).toBe(false);
  });

  test("is true once a run went well today, whichever machine did it", async () => {
    await record(FAILED, "2026-11-23T08:00:00Z");
    await record(OK, "2026-11-23T08:05:00Z");
    expect(await ranToday("2026-11-23T12:00:00Z")).toBe(true);
  });

  test("a good run of yesterday does not count", async () => {
    await record(OK, "2026-11-22T08:00:00Z");
    expect(await ranToday("2026-11-23T08:30:00Z")).toBe(false);
  });

  test("days are Madrid days: 00:30 in Madrid is already the next day, in winter and in summer", async () => {
    await record(OK, "2026-11-22T23:30:00Z"); // 00:30 on the 23rd in Madrid (UTC+1)
    expect(await ranToday("2026-11-23T08:00:00Z")).toBe(true);
    expect(await ranToday("2026-11-22T12:00:00Z")).toBe(false);
    await record(OK, "2026-07-14T22:30:00Z"); // 00:30 on the 15th in Madrid (UTC+2)
    expect(await ranToday("2026-07-15T08:00:00Z")).toBe(true);
    expect(await ranToday("2026-07-14T12:00:00Z")).toBe(false);
  });
});
