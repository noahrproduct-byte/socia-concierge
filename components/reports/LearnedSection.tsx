// Reports: what SOCIA learned. The last weekly plan's results and the
// strategy's experiments that have a verdict (lib/experiments.ts), brand-wide
// rather than limited to the report's period. Renders nothing when there is
// nothing yet.

import { VERDICT_LABEL, type ExperimentRow } from "@/lib/experiments";

export type Learned = { experiments: ExperimentRow[]; planLine: string | null };

/** What SOCIA learned: the last plan's results and the experiments with a verdict. Shown only when there is something. */
export default function LearnedSection({ learned }: { learned: Learned }) {
  const decided = learned.experiments.filter((e) => e.result.verdict !== "too_early");
  const waiting = learned.experiments.length - decided.length;
  if (!decided.length && !learned.planLine) return null;
  return (
    <section className="rep-section">
      <div className="rep-card-head"><h2>What SOCIA learned</h2></div>
      <ul className="rep-summary">
        {learned.planLine && <li>Last weekly plan: {learned.planLine}</li>}
        {decided.map((e) => (
          <li key={e.id}><b>{VERDICT_LABEL[e.result.verdict]}:</b> {e.hypothesis.replace(/\.$/, "")}. {e.result.interpretation} Next: {e.result.nextAction}</li>
        ))}
        {waiting > 0 && <li>{waiting} more {waiting === 1 ? "experiment is" : "experiments are"} still collecting test posts.</li>}
      </ul>
      <p className="rep-empty">Each post is measured against the account&apos;s own median once its numbers settle; a result needs 3 settled test posts and is not a guarantee.</p>
    </section>
  );
}

