import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { Sparkline } from "./ui";

// Signature "Content Score" surface from the brand board: overall score + trend,
// with the five sub-scores the AI grades every post on.
const SCORE = 87;
const VERDICT = "Great";
const TREND = [68, 71, 70, 74, 77, 79, 78, 82, 85, 87];
const BARS = [
  { label: "Hook", value: 92 },
  { label: "Retention", value: 85 },
  { label: "Relevance", value: 88 },
  { label: "Originality", value: 78 },
  { label: "Timing", value: 90 },
];

export default function ContentScoreCard() {
  return (
    <Card className="mb-3.5 gap-0 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--charcoal)]">Content Score</h3>
          <p className="text-[13px] text-muted-foreground">
            Your last 30 posts, graded by the AI before they went out.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
          <Sparkles size={13} /> AI graded
        </span>
      </div>

      <div className="mt-5 grid gap-8 md:grid-cols-[220px_1fr] md:items-center">
        <div>
          <div className="flex items-end gap-1.5">
            <span className="text-[52px] font-bold leading-none tracking-tight text-[var(--charcoal)]">
              {SCORE}
            </span>
            <span className="mb-2 text-[17px] font-medium text-muted-foreground">/100</span>
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-[var(--accent)]">{VERDICT}</div>
          <div className="mt-3 h-10 w-full">
            <Sparkline data={TREND} up />
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {BARS.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[13px] text-[var(--slate)]">{b.label}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--silver)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                  style={{ width: `${b.value}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-[13px] font-semibold text-[var(--charcoal)]">
                {b.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
