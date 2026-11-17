// Every row of a query, read a page at a time. The Supabase API returns at
// most a fixed number of rows per request (1,000 by default) and says nothing
// when there were more, so a scheduled job that reads "every connected
// account" in one request quietly stops seeing accounts past that number.
// This asks for pages until one comes back short. Up to the first page it is
// the same single request as before.

/** Rows asked for per request. At or below the API's own cap, so a full page always means "ask again". */
export const PAGE_ROWS = 1000;
/** A ceiling on what one job reads, so a mistake can't loop for ever. */
export const MAX_ROWS = 200_000;

// The client can't always work out the row type from a column list held in a variable, so the page is read loosely and the caller names the type.
type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/**
 * `page(from, to)` must return the rows `from..to` (inclusive) of one query in
 * a fixed order, e.g. `svc.from("t").select(cols).order("user_id").range(from, to)`.
 * Stops and reports the error of the first page that fails; rows read before
 * a later failure are kept, so the job still does the work it can.
 */
export async function allRows<T>(page: (from: number, to: number) => Page, size = PAGE_ROWS, max = MAX_ROWS): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, error: from === 0 ? error : null };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return { data: out, error: null };
}
