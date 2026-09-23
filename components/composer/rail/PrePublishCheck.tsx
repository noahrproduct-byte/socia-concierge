"use client";

// SOCIA insight: the account's own posting-time history, with its sample size,
// plus a link to Content Studio for a video. Technical and content readiness
// live in the readiness panel now; this card is only the strategy read, and it
// is shown only when there is something real to say. No scores, no predictions.

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { RailProps } from "@/components/composer/contracts";
import { enabledDestinations } from "@/lib/publishing/composer";
import { historySentence, recommendedWindows, YOUTUBE_NO_HISTORY_SENTENCE } from "@/lib/publishing/timing";
import { PLATFORM_LABEL } from "@/lib/publishing/types";
import { useNow, useViewerZone } from "./ReadinessPanel";

export default function PrePublishCheck({ draft, accounts, timing }: RailProps) {
  const tz = useViewerZone();
  const now = useNow(60_000);
  const enabled = enabledDestinations(draft);
  const ig = enabled.filter((d) => d.platform === "instagram");
  const yt = enabled.filter((d) => d.platform === "youtube");
  const firstIsVideo = draft.media[0]?.kind === "video";

  const timed = timing.instagram?.timed ?? null;
  const rec = useMemo(
    () => (timed && now ? recommendedWindows(timed, now, tz ?? "UTC") : null),
    [timed, now, tz],
  );

  const labelFor = (platform: string, accountId: string) => {
    const a = accounts.find((x) => x.platform === platform && x.accountId === accountId);
    return a?.label ?? accountId;
  };

  // Nothing to say when no destination is selected: the panel stays hidden.
  if (enabled.length === 0) return null;

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-insight-h">
      <div className="ov-card-head">
        <h2 id="cr-insight-h"><Sparkles size={14} className="cr-insight-ico" /> SOCIA insight</h2>
      </div>
      <div className="cr-group cr-group-first">
        <h3>Timing</h3>
        {ig.map((d) => (
          <p key={d.key} className="cr-check-line">
            <strong>{PLATFORM_LABEL.instagram}{ig.length > 1 ? ` · ${labelFor(d.platform, d.accountId)}` : ""}.</strong>{" "}
            {historySentence(rec, timed != null)}
          </p>
        ))}
        {yt.map((d) => (
          <p key={d.key} className="cr-check-line">
            <strong>{PLATFORM_LABEL.youtube}{yt.length > 1 ? ` · ${labelFor(d.platform, d.accountId)}` : ""}.</strong>{" "}
            {draft.schedule.mode === "recommended" ? YOUTUBE_NO_HISTORY_SENTENCE : "SOCIA has no YouTube posting history yet."}
          </p>
        ))}
      </div>
      {firstIsVideo && (
        <Link href="/studio" className="cr-link">
          Analyze this video in Content Studio <ArrowRight size={13} />
        </Link>
      )}
    </section>
  );
}
