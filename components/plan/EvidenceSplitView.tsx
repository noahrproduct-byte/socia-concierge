// A planned post's evidence in its three kinds (lib/schema.ts EvidenceSplit),
// never mixed: what SOCIA's numbers show, each line with the post or Reel it
// comes from; what SOCIA reads into them; and what to expect, labelled a guess.
// The account's own posts it cites are listed with their numbers and a link.
import type { EvidenceSplit } from "@/lib/schema";
import type { OwnPostRef } from "@/lib/planEvidenceFormat";
import { ownPostNumbers } from "@/lib/planEvidenceFormat";

const BASIS: Record<EvidenceSplit["basis"], string | null> = {
  data: null,
  thin: "Thin data: SOCIA has too little of your own data to stand this idea on. Treat it as a test.",
  experiment: "A test: run it, then the result tells you whether to keep it.",
};

export default function EvidenceSplitView({ split, own }: { split: EvidenceSplit; own?: OwnPostRef[] }) {
  return (
    <div className="pf-split">
      {BASIS[split.basis] && <p className="pf-split-basis">{BASIS[split.basis]}</p>}
      {split.observed.length > 0 && (
        <section>
          <h4>What the numbers show</h4>
          <ul>{split.observed.map((l, k) => <li key={k}>{l}</li>)}</ul>
        </section>
      )}
      {own && own.length > 0 && (
        <section>
          <h4>Your posts it draws on</h4>
          <ul>
            {own.map((p) => (
              <li key={p.id}>
                <b>[{p.id}]</b>{" "}
                {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="s-link">{p.title}</a> : p.title}
                <small> {p.format}{p.date ? `, ${p.date}` : ""}: {ownPostNumbers(p)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {split.reading && (
        <section>
          <h4>What SOCIA reads into it</h4>
          <p>{split.reading}</p>
        </section>
      )}
      {split.expect && (
        <section>
          <h4>What to expect <small>(a guess before posting, not a result)</small></h4>
          <p>{split.expect}</p>
        </section>
      )}
    </div>
  );
}
