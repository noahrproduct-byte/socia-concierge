// Spread many posts across the coming week. Pure and zone-free: every date is
// a local Date the calendar already works in (the board runs after mount in
// the viewer's own zone). Rules, in order:
//   1. Days with nothing on them are used first, spaced evenly across the week
//      when there are fewer new posts than free days.
//   2. Past that, days fill round-robin by how many posts they hold (existing
//      ones count), earliest day first on ties.
//   3. A day's first new post lands at the audience hour for that weekday; a
//      second or third on the same day sits three hours later or earlier,
//      never within an hour of another post, never outside 8:00 to 21:00.
// Nothing is scheduled here: the caller shows the slots and the person
// confirms. Tested in lib/spread.test.ts.

export type SpreadInput = {
  count: number;
  now: Date;
  /** times of posts already on the calendar (any status that occupies a slot) */
  existing: Date[];
  /** the calendar's own audience hour for a weekday, Monday = 0 */
  hourFor: (weekdayMonFirst: number) => number;
  /** how many days from tomorrow to spread over */
  days?: number;
};

export type SpreadSlot = {
  index: number;
  at: Date;
  /** 0 = tomorrow */
  dayOffset: number;
  weekdayMonFirst: number;
  /** how many posts share that day once these are added (existing included) */
  onDay: number;
};

export const SPREAD_DAYS = 7;
const EARLIEST = 8;
const LATEST = 21;
const HOUR_MS = 3_600_000;
const OFFSETS = [0, 3, -3, 6, -6, 9, -9, 12];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monFirst = (d: Date) => (d.getDay() + 6) % 7;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Which days (0 = tomorrow) each of `count` posts goes on. */
export function spreadDays(count: number, existingPerDay: number[]): number[] {
  const n = existingPerDay.length;
  const assigned = new Array<number>(n).fill(0);
  const out: number[] = [];
  const free = existingPerDay.map((e, i) => (e === 0 ? i : -1)).filter((i) => i >= 0);
  // 1) even spacing over the free days while they suffice
  const firstPass = Math.min(count, free.length);
  for (let j = 0; j < firstPass; j++) {
    const i = free[Math.min(free.length - 1, Math.round(((j + 0.5) * free.length) / firstPass - 0.5))];
    if (assigned[i]) { // rounding collided: take the next free day not yet used
      const alt = free.find((f) => !assigned[f]);
      if (alt == null) break;
      assigned[alt]++; out.push(alt);
    } else { assigned[i]++; out.push(i); }
  }
  // 2) the rest round-robin by load, earliest day on ties
  while (out.length < count && n > 0) {
    let best = 0, bestLoad = Infinity;
    for (let i = 0; i < n; i++) { const load = assigned[i] + existingPerDay[i]; if (load < bestLoad) { best = i; bestLoad = load; } }
    assigned[best]++; out.push(best);
  }
  return out;
}

export function spreadSlots(input: SpreadInput): SpreadSlot[] {
  const days = input.days ?? SPREAD_DAYS;
  const count = Math.max(0, Math.floor(input.count));
  const base = startOfDay(input.now);
  const dates = Array.from({ length: days }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i + 1));
  const existingByDay = dates.map((d) => input.existing.filter((e) => sameDay(e, d)));
  const dayOf = spreadDays(count, existingByDay.map((x) => x.length));

  const taken = existingByDay.map((x) => x.map((e) => e.getTime()));
  const nth = new Array<number>(days).fill(0);
  const slots: SpreadSlot[] = [];
  for (let index = 0; index < dayOf.length; index++) {
    const i = dayOf[index];
    const d = dates[i];
    const weekday = monFirst(d);
    const h0 = Math.max(EARLIEST, Math.min(LATEST, Math.round(input.hourFor(weekday))));
    const k = nth[i]++;
    let hour = h0 + (OFFSETS[Math.min(k, OFFSETS.length - 1)] ?? 0);
    hour = Math.max(EARLIEST, Math.min(LATEST, hour));
    let at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
    // never within an hour of another post that day
    let guard = 0;
    while (taken[i].some((t) => Math.abs(t - at.getTime()) < HOUR_MS) && guard++ < 16) {
      at = new Date(at.getTime() + HOUR_MS);
      if (at.getHours() > LATEST) at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), EARLIEST, 0, 0, 0);
    }
    taken[i].push(at.getTime());
    slots.push({ index, at, dayOffset: i, weekdayMonFirst: weekday, onDay: 0 });
  }
  for (const s of slots) s.onDay = taken[s.dayOffset].length;
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);
}
