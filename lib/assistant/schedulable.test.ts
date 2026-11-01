import { describe, expect, it } from "vitest";
import { schedulableBlock, type Schedulable } from "./schedulable";

const post = (n: number, id: string, over: Partial<Schedulable> = {}): Schedulable => ({
  n, id, title: `Post ${n}`, status: "draft", at: null, createdAt: "2026-11-01T15:00:00Z", platforms: [], legacy: true, fixed: null, ...over,
});

describe("schedulableBlock", () => {
  it("marks the drafts added in this chat, and only those", () => {
    const out = schedulableBlock([post(1, "a"), post(2, "b"), post(3, "c")], "UTC", new Set(["a", "c"])).split("\n");
    expect(out[0]).toMatch(/^\[S1\] draft added in this chat, made /);
    expect(out[1]).toMatch(/^\[S2\] draft, made /);
    expect(out[2]).toMatch(/^\[S3\] draft added in this chat, made /);
  });

  it("never marks a scheduled post, even when its id was sent", () => {
    const out = schedulableBlock([post(1, "a", { status: "scheduled", at: "2026-11-03T18:00:00Z" })], "UTC", new Set(["a"]));
    expect(out).toMatch(/^\[S1\] scheduled for /);
    expect(out).not.toMatch(/added in this chat/);
  });

  it("reads as before without any ids", () => {
    expect(schedulableBlock([post(1, "a")], "UTC")).toMatch(/^\[S1\] draft, made /);
  });
});
