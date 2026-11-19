import { describe, it, expect } from "vitest";
import { waitingDayIndexes } from "./planWaiting";

describe("waitingDayIndexes", () => {
  const days = [
    {},
    { decision: { status: "approved" } },
    { decision: { status: "rejected" } },
    { animated: true },
    {},
    {},
  ];
  it("keeps only days with no decision, not animated and not on the Calendar", () => {
    expect(waitingDayIndexes(days, (i) => i === 4)).toEqual([0, 5]);
  });
  it("an approved day is never offered again, even when its draft is not found on the Calendar", () => {
    expect(waitingDayIndexes(days, () => false)).not.toContain(1);
  });
  it("is empty when every day is decided or placed", () => {
    expect(waitingDayIndexes([{ decision: { status: "approved" } }, {}], (i) => i === 1)).toEqual([]);
  });
});
