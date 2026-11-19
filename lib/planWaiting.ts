// Which plan days still wait for a decision. One rule for the Approve week
// button (how many are left) and the request it sends (which days go on the
// Calendar), so the two can never disagree.

export type WaitingDay = { animated?: boolean; decision?: { status: string } | null };

/**
 * Indexes of the days Approve week may place: not animated (those go on the
 * Calendar with their video), not approved or turned down, not already on
 * the Calendar. A day placed once is never placed a second time.
 */
export function waitingDayIndexes(days: readonly WaitingDay[], onCalendar: (i: number) => boolean): number[] {
  const out: number[] = [];
  days.forEach((d, i) => {
    if (!d.animated && !d.decision && !onCalendar(i)) out.push(i);
  });
  return out;
}
