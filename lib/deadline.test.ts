import { describe, expect, it, vi } from "vitest";
import { DeadlineError, deadlineFor, withDeadline } from "./deadline";

describe("a time limit for long work", () => {
  it("returns the work when it finishes in time", async () => {
    await expect(withDeadline(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it("stops waiting at the limit", async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => undefined);
    const p = withDeadline(never, 1000);
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    const e = await caught;
    expect(e).toBeInstanceOf(DeadlineError);
    expect((e as DeadlineError).ms).toBe(1000);
    vi.useRealTimers();
  });
  it("passes the work's own failure through", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
  it("leaves room before the platform's limit", () => {
    expect(deadlineFor(300)).toBe(275_000);
    expect(deadlineFor(60)).toBe(35_000);
    expect(deadlineFor(10)).toBe(5_000);
  });
});
