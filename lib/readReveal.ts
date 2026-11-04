// The scale in the read reveal (components/ReadReveal.tsx): one tick per post
// SOCIA read, grouped by format. Pure.

const MAX_TICKS = 60;

/** One tick per post read, grouped by format, at most MAX_TICKS (scaled down evenly when there are more). Pure. */
export function ticksFor(formats: { format: string; count: number }[], total: number): { format: string; ticks: number }[] {
  const known = formats.reduce((s, f) => s + f.count, 0);
  const groups = known > 0 ? formats.filter((f) => f.count > 0) : total > 0 ? [{ format: "Post", count: total }] : [];
  const sum = groups.reduce((s, f) => s + f.count, 0);
  const scale = sum > MAX_TICKS ? MAX_TICKS / sum : 1;
  return groups.map((f) => ({ format: f.format, ticks: Math.max(1, Math.round(f.count * scale)) }));
}

