// PostgREST answers at most 1000 rows per request (Supabase's default). Tables that grow with every match
// (results, snapshots) must be read page by page, or the page silently shows a truncated league.
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Reads a whole table through `read(from, to)` (inclusive bounds, like `.range()`). The query behind
 * `read` must have a total order, or rows can repeat or vanish between pages.
 */
export async function fetchAllPages<T>(
  what: string,
  read: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}
