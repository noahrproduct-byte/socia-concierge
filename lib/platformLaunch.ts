// When TikTok and Facebook open for connections, and what to say until then.
// A countdown is shown only for a launch date SOCIA has confirmed: one set in
// the server's configuration (PLATFORM_LAUNCH_TIKTOK, PLATFORM_LAUNCH_FACEBOOK)
// as a full timestamp with its time zone, e.g. "2026-11-25T17:00:00-06:00".
// No date means "awaiting platform access", never an invented countdown; a
// date that passes while the platform is still offline says the launch is
// late instead of sitting at zero. The deadline is one absolute instant, so
// every device and every refresh counts down to the same moment.
// Pure and browser-safe; the server reads the variables (launchDates).

import type { OfflinePlatform } from "./platformStatus";

/** A launch instant from configuration: an ISO timestamp with an explicit zone ("Z" or ±hh:mm), else null. */
export function parseLaunchAt(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Server only: the confirmed launch instants, by platform. */
export function launchDates(env: Record<string, string | undefined> = process.env): Record<OfflinePlatform, string | null> {
  return {
    tiktok: parseLaunchAt(env.PLATFORM_LAUNCH_TIKTOK),
    facebook: parseLaunchAt(env.PLATFORM_LAUNCH_FACEBOOK),
  };
}

export type LaunchPhase =
  /** a confirmed date still ahead */
  | { kind: "countdown"; at: string; remainingMs: number }
  /** no confirmed date: waiting on the platform */
  | { kind: "awaiting" }
  /** the confirmed date passed and the platform is still not open */
  | { kind: "late"; at: string };

export function launchPhase(at: string | null, now: number): LaunchPhase {
  if (!at) return { kind: "awaiting" };
  const ms = Date.parse(at) - now;
  return ms > 0 ? { kind: "countdown", at, remainingMs: ms } : { kind: "late", at };
}

/** Whole days, hours and minutes left, rounding the minutes up so the last minute never reads 0. */
export function countdownParts(ms: number): { days: number; hours: number; minutes: number } {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  return { days: Math.floor(totalMin / 1440), hours: Math.floor((totalMin % 1440) / 60), minutes: totalMin % 60 };
}

/** The launch moment in the viewer's own time zone, e.g. "Tue, Nov 25, 5:00 PM". */
export function launchWhen(at: string, timeZone?: string): string {
  return new Date(at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

export const LAUNCH_COPY = {
  awaiting: "Awaiting platform access. There is no confirmed date yet.",
  countdown: "Coming soon",
  late: "Taking longer than planned. Still awaiting platform access.",
} as const;
