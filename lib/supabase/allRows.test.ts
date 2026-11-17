import { describe, expect, it } from "vitest";
import { allRows } from "./allRows";

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const pager = (rows: { id: number }[], calls: [number, number][], failAt = -1) => async (from: number, to: number) => {
  calls.push([from, to]);
  if (calls.length - 1 === failAt) return { data: null, error: { message: "boom" } };
  return { data: rows.slice(from, to + 1), error: null };
};

describe("reading every row a page at a time", () => {
  it("is one request when everything fits", async () => {
    const calls: [number, number][] = [];
    const r = await allRows(pager(table(7), calls), 10);
    expect(r.data).toHaveLength(7);
    expect(calls).toEqual([[0, 9]]);
  });
  it("keeps asking while pages come back full", async () => {
    const calls: [number, number][] = [];
    const r = await allRows<{ id: number }>(pager(table(25), calls), 10);
    expect(r.data.map((x) => x.id)).toEqual(table(25).map((x) => x.id));
    expect(calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });
  it("asks once more after an exactly full last page, and gets nothing", async () => {
    const calls: [number, number][] = [];
    const r = await allRows(pager(table(20), calls), 10);
    expect(r.data).toHaveLength(20);
    expect(calls).toHaveLength(3);
  });
  it("reports a failure of the first page", async () => {
    const r = await allRows(pager(table(5), [], 0), 10);
    expect(r.error).toBeTruthy();
    expect(r.data).toEqual([]);
  });
  it("keeps what it read when a later page fails", async () => {
    const r = await allRows(pager(table(25), [], 1), 10);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(10);
  });
  it("never reads past the ceiling", async () => {
    const calls: [number, number][] = [];
    const r = await allRows(async (from, to) => { calls.push([from, to]); return { data: table(10), error: null }; }, 10, 30);
    expect(r.data).toHaveLength(30);
    expect(calls).toHaveLength(3);
  });
});
