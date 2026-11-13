import { Database, GitCompareArrows, ScanEye, Sigma, Users, CircleDashed } from "lucide-react";
import type { ReactNode } from "react";
import "./evidence.css";

// "Not another AI guess": one example recommendation taken apart into what
// it stands on, with each line labelled by the kind of statement it is.
// SOCIA's own screens use the same distinction: a number a platform
// measured, a comparison with the account's own median, public posts from
// accounts the person follows, the model's reading of a video, an estimate
// (with its confidence), and what there isn't enough data to say. Every
// value here is an example and says so.

type Kind = "measured" | "compared" | "competitor" | "analysis" | "estimate" | "unknown";

const KIND: Record<Kind, { name: string; icon: ReactNode; what: string }> = {
  measured: { name: "Measured", icon: <Database aria-hidden />, what: "A number the platform reported for your account." },
  compared: { name: "Compared", icon: <GitCompareArrows aria-hidden />, what: "Your post against your own median at the same age." },
  competitor: { name: "Competitor data", icon: <Users aria-hidden />, what: "Public posts from accounts you chose to follow." },
  analysis: { name: "AI analysis", icon: <ScanEye aria-hidden />, what: "The model's reading of a video or caption. It can be wrong." },
  estimate: { name: "Estimate", icon: <Sigma aria-hidden />, what: "A prediction, always shown with how sure it is." },
  unknown: { name: "Not enough data", icon: <CircleDashed aria-hidden />, what: "Where SOCIA says it can't tell yet, instead of guessing." },
};

const LEDGER: { kind: Kind; line: string; source: string }[] = [
  { kind: "measured", line: "Your 8 tutorial Reels in the last 90 days averaged 3,940 views at 48 hours.", source: "Instagram Insights, 90 days" },
  { kind: "compared", line: "Tutorials beat your median post 6 times out of 8. Talking-only Reels beat it 2 times out of 9.", source: "Your 31 posts, same age" },
  { kind: "competitor", line: "Two accounts you follow posted lighting videos this month; both beat their own medians.", source: "2 of 5 followed accounts" },
  { kind: "analysis", line: "Your best tutorial shows the result in the first second; your weakest opens on you talking.", source: "Video read of your top and bottom 3" },
  { kind: "estimate", line: "Likely above your median if posted Friday after 6 PM.", source: "Confidence: medium" },
  { kind: "unknown", line: "Whether a 30-second version would do better: you haven't posted one yet.", source: "0 posts to compare" },
];

export default function Evidence() {
  return (
    <section className="hm-section ev" id="evidence" aria-labelledby="ev-h">
      <div className="hm-wrap">
        <div className="hm-section-head" data-reveal="children">
          <span className="hm-eyebrow">How SOCIA decides</span>
          <h2 id="ev-h" className="hm-h2">
            Not another AI guess. <em>A decision backed by evidence.</em>
          </h2>
          <p className="hm-lead">SOCIA connects what you create with what your audience actually responds to, and tells you which is which.</p>
        </div>

        <div className="ev-body">
          <article className="ev-rec" aria-label="Example recommendation">
            <header>
              <span>Recommendation</span>
              <span className="hm-example">Example</span>
            </header>
            <b>Film a 20-second lighting tutorial for Friday, 6:30 PM.</b>
            <p>Open on the result, not on you. Three setups, one per shot, captions in the middle.</p>
            <span className="ev-rec-foot">Built from the six lines beside it. Open any recommendation in SOCIA to see its own.</span>
          </article>

          <ol className="ev-ledger" aria-label="What the example recommendation is based on">
            {LEDGER.map((row) => {
              const k = KIND[row.kind];
              return (
                <li key={row.kind} className={`ev-row is-${row.kind}`}>
                  <span className="ev-kind" title={k.what}>
                    {k.icon}
                    {k.name}
                  </span>
                  <span className="ev-line">{row.line}</span>
                  <span className="ev-source">{row.source}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="ev-note">
          Every line SOCIA shows you is labelled like these: measured, compared, competitor data, AI analysis, an estimate, or not
          enough data. Predictions always carry their confidence.
        </p>
      </div>
    </section>
  );
}
