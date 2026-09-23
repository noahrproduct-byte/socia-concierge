"use client";

// SOCIA's pre-publish check. Three groups of measured facts:
//   TECHNICAL  the readiness level per destination (lib/publishing/validate)
//   CONTENT    contentChecks (lib/publishing/precheck): counts, limits, required answers
//   TIMING     what the account's own Instagram history says, with its sample size
// No scores and no predictions. Video analysis lives in Content Studio; this
// panel only links there.

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RailProps } from "@/components/composer/contracts";
import { enabledDestinations, review } from "@/lib/publishing/composer";
import { contentChecks } from "@/lib/publishing/precheck";
import { historySentence, recommendedWindows, YOUTUBE_NO_HISTORY_SENTENCE } from "@/lib/publishing/timing";
import { PLATFORM_LABEL } from "@/lib/publishing/types";
import { LevelPill, PlatformMark, useNow, useViewerZone } from "./ReadinessPanel";

export default function PrePublishCheck({ draft, accounts, timing }: RailProps) {
  const tz = useViewerZone();
  const now = useNow(60_000);
  const rev = review(draft, accounts);
  const checks = contentChecks(draft, accounts);
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

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-check-h">
      <div className="ov-card-head">
        <h2 id="cr-check-h">SOCIA pre-publish check</h2>
      </div>

      <div className="cr-group">
        <h3>Technical</h3>
        {rev.rows.length === 0 ? (
          <p className="cr-check-line">No destination selected yet.</p>
        ) : (
          <ul className="cr-checks">
            {rev.rows.map((r) => (
              <li key={r.key} className="cr-check">
                <span className="cr-plat">
                  <PlatformMark platform={r.platform} />
                  {PLATFORM_LABEL[r.platform]}
                  <small>{r.label}</small>
                </span>
                <LevelPill level={r.readiness.level} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cr-group">
        <h3>Content</h3>
        <ul className="cr-checks">
          {checks.map((c) => (
            <li key={c.id} className={`cr-check cr-${c.tone}`}>
              <span className="cr-check-label">{c.label}</span>
              <span className="cr-check-value">{c.value}</span>
            </li>
          ))}
        </ul>
        {firstIsVideo && (
          <Link href="/studio" className="cr-link">
            Analyze this video in Content Studio <ArrowRight size={13} />
          </Link>
        )}
      </div>

      <div className="cr-group">
        <h3>Timing</h3>
        {ig.length === 0 && yt.length === 0 && <p className="cr-check-line">No destination selected yet.</p>}
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
    </section>
  );
}
