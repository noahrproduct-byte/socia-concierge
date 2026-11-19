// A short note on Analytics and the Content Plan for an account still
// building its history (lib/starter/readiness.ts): why SOCIA isn't reading
// much into its numbers yet, and where the starter strategy is.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Readiness } from "@/lib/starter/readiness";

export default function StarterNote({ readiness }: { readiness: Readiness | null }) {
  if (!readiness || readiness.stage !== "starting") return null;
  const t = readiness.thresholds;
  return (
    <aside className="stn" aria-label="Your account is still building its history">
      <p>
        <b>Your account is still building its history</b>: {readiness.measured} of {t.startUnder} measured posts. Until then SOCIA plans from your goals and your niche, and runs experiments to learn what works for you.
      </p>
      <Link href="/plan/strategy" className="stn-link">See your starter strategy <ArrowRight size={13} aria-hidden /></Link>
    </aside>
  );
}
