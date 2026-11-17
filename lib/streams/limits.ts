// Live streams by plan (lib/plans.ts STREAM_LIMITS): how many channels at once,
// how many hours of live watching a month, and whether the clip's video comes
// into SOCIA. Pure; shared by the routes, the watcher and the page.

export type StreamAllowance = {
  /** channels watched at once */
  channels: number;
  /** hours of live watching a month (each live channel counts) */
  hoursMonth: number;
  /** the clip's video is saved into SOCIA on own or edited channels */
  keepVideo: boolean;
  /** live watching used this plan month, seconds */
  usedSeconds: number;
  /** the first day of the plan month (the usage row's key) and when it starts again */
  periodStart: string;
  resetsOn: string;
};

/** Hours used and left, whole minutes, for the page. */
export function hoursLeft(a: Pick<StreamAllowance, "hoursMonth" | "usedSeconds">): { usedHours: number; leftHours: number; out: boolean } {
  const used = Math.round((a.usedSeconds / 3600) * 10) / 10;
  const left = Math.max(0, Math.round((a.hoursMonth - a.usedSeconds / 3600) * 10) / 10);
  return { usedHours: used, leftHours: left, out: a.usedSeconds >= a.hoursMonth * 3600 };
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Why these channels can't start on this plan, or null when they can. */
export function startRefusal(a: StreamAllowance, watching: number, adding: number): string | null {
  if (a.channels <= 0 || a.hoursMonth <= 0) return "Live streams aren't on your plan.";
  if (hoursLeft(a).out) return `This month's ${a.hoursMonth} hours of live stream watching are used. They come back on ${fmtDay(a.resetsOn)}.`;
  if (watching + adding > a.channels) {
    return a.channels === 1
      ? "Your plan watches 1 live stream at a time. Stop the one you're watching first, or upgrade to watch more at once."
      : `Your plan watches ${a.channels} live streams at a time. Stop one first, or upgrade to watch more at once.`;
  }
  return null;
}

/** What the watcher writes on a channel it stops because the month's hours ran out. */
export const outOfHoursNote = (hoursMonth: number) => `Stopped: this month's ${hoursMonth} hours of live stream watching are used.`;
