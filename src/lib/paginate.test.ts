import { describe, expect, test } from "vitest";
import { fetchAllPages } from "@/lib/paginate";

/** A fake table: answers range requests like PostgREST does (inclusive bounds). */
const table = (n: number) => {
  const calls: [number, number][] = [];
  const read = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: Array.from({ length: n }, (_, i) => i).slice(from, to + 1), error: null };
  };
  return { read, calls };
};

describe("fetchAllPages", () => {
  test("joins every page of a table longer than one page", async () => {
    const t = table(25);
    const rows = await fetchAllPages("numbers", t.read, 10);
    expect(rows).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(t.calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });
  test("a table that ends exactly on a page boundary asks once more and stops", async () => {
    const t = table(20);
    expect(await fetchAllPages("numbers", t.read, 10)).toHaveLength(20);
    expect(t.calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });
  test("an empty table is one request", async () => {
    const t = table(0);
    expect(await fetchAllPages("numbers", t.read, 10)).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });
  test("an API error names what was being read", async () => {
    const failing = async () => ({ data: null, error: { message: "permission denied" } });
    await expect(fetchAllPages("match results", failing, 10)).rejects.toThrow("match results: permission denied");
  });
});
