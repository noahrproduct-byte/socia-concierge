// Growth opportunities (lib/intel/opportunities.ts): what comparable accounts
// do that works for them and this brand hasn't tried. Each says what was
// observed (their numbers), where the brand stands, how to try it and, in the
// full list, why it may work and real examples. Compact on the Dashboard,
// full on Plan > Strategy. Server-safe: no client state.

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Opportunity } from "@/lib/intel/opportunities";

const KIND: Record<Opportunity["kind"], string> = { hook: "Hook", topic: "Topic", format: "Format", cadence: "Posting rhythm" };
const x = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}x`;

export default function Opportunities({ list, compact = false }: { list: Opportunity[]; compact?: boolean }) {
  if (!list.length) return null;
  return (
    <div className={`opp${compact ? " is-compact" : ""}`}>
      <ul className="opp-list">
        {list.map((o) => (
          <li key={o.id} className="opp-item">
            <span className="opp-kind">{KIND[o.kind]}</span>
            <b className="opp-title">{o.title}</b>
            <p className="opp-observed">{o.observed}</p>
            <p className="opp-you">{o.you}</p>
            {!compact && <p className="opp-why">{o.why}</p>}
            <p className="opp-how"><span>Try it:</span> {o.how}</p>
            {!compact && o.examples.length > 0 && (
              <ul className="opp-examples" aria-label="Examples">
                {o.examples.map((e) => (
                  <li key={e.url}>
                    <a href={e.url} target="_blank" rel="noreferrer">&ldquo;{e.line}&rdquo; <ExternalLink size={11} aria-hidden /></a>
                    <small>{e.account}{e.multiplier != null ? `, ${x(e.multiplier)} their usual ${e.basis}` : ""}</small>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="opp-note">
        Seen on the accounts you learn from, and untested on yours. Try one as a test: your own results decide.
        {compact && <> <Link href="/plan/strategy" className="opp-more">All opportunities <ArrowRight size={12} aria-hidden /></Link></>}
      </p>
    </div>
  );
}
