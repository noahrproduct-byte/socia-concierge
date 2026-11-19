import { describe, expect, it } from "vitest";
import { countdownParts, launchDates, launchPhase, launchWhen, parseLaunchAt } from "./platformLaunch";

describe("parseLaunchAt", () => {
  it("takes a timestamp with its time zone and stores the absolute instant", () => {
    expect(parseLaunchAt("2026-11-25T17:00:00-06:00")).toBe("2026-11-25T23:00:00.000Z");
    expect(parseLaunchAt(" 2026-11-25T23:00:00Z ")).toBe("2026-11-25T23:00:00.000Z");
  });
  it("refuses a date with no time zone, so no device reads it in its own zone", () => {
    expect(parseLaunchAt("2026-11-25T17:00:00")).toBeNull();
    expect(parseLaunchAt("2026-11-25")).toBeNull();
    expect(parseLaunchAt("next week")).toBeNull();
    expect(parseLaunchAt(undefined)).toBeNull();
  });
  it("reads each platform's own variable", () => {
    expect(launchDates({ PLATFORM_LAUNCH_TIKTOK: "2026-11-25T00:00:00Z" })).toEqual({ tiktok: "2026-11-25T00:00:00.000Z", facebook: null });
  });
});

describe("launchPhase", () => {
  const at = "2026-11-25T23:00:00.000Z";
  const t = (iso: string) => Date.parse(iso);
  it("no confirmed date: awaiting platform access, never a countdown", () => {
    expect(launchPhase(null, t("2026-11-18T00:00:00Z"))).toEqual({ kind: "awaiting" });
  });
  it("counts down to the same instant from anywhere, after any refresh", () => {
    const p = launchPhase(at, t("2026-11-18T08:28:00Z"));
    expect(p).toEqual({ kind: "countdown", at, remainingMs: t(at) - t("2026-11-18T08:28:00Z") });
    if (p.kind === "countdown") expect(countdownParts(p.remainingMs)).toEqual({ days: 7, hours: 14, minutes: 32 });
  });
  it("once the date passes without a launch, it says it is late instead of showing zero", () => {
    expect(launchPhase(at, t(at))).toEqual({ kind: "late", at });
    expect(launchPhase(at, t("2026-12-01T00:00:00Z")).kind).toBe("late");
  });
});

describe("countdownParts", () => {
  it("rounds the last seconds up to one minute, never to zero", () => {
    expect(countdownParts(5_000)).toEqual({ days: 0, hours: 0, minutes: 1 });
    expect(countdownParts(60 * 60_000)).toEqual({ days: 0, hours: 1, minutes: 0 });
    expect(countdownParts(-1)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe("launchWhen", () => {
  it("shows the moment in the viewer's own zone", () => {
    expect(launchWhen("2026-11-25T23:00:00.000Z", "America/Chicago")).toBe("Wed, Nov 25, 5:00 PM");
    expect(launchWhen("2026-11-25T23:00:00.000Z", "Europe/London")).toBe("Wed, Nov 25, 11:00 PM");
  });
});
