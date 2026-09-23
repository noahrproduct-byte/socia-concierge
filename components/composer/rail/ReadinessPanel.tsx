"use client";

// "Platform readiness": one row per enabled destination with its level and
// the deterministic issues from lib/publishing/validate. Clicking an issue
// asks the page to focus the field it names.
//
// This file also holds the small pieces every rail section shares (platform
// mark, level pill, viewer-zone and clock hooks) so the rail stays inside its
// own folder.

import { useEffect, useState } from "react";
import type { RailProps } from "@/components/composer/contracts";
import { review } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type Platform } from "@/lib/publishing/types";
import type { ReadinessLevel } from "@/lib/publishing/validate";
import { viewerTimeZone } from "@/lib/publishing/timing";

export const LEVEL_LABEL: Record<ReadinessLevel, string> = { ready: "Ready", warning: "Warning", blocked: "Blocked" };

export function LevelPill({ level }: { level: ReadinessLevel }) {
  return <span className={`cr-pill cr-${level}`}>{LEVEL_LABEL[level]}</span>;
}

export function PlatformMark({ platform, size = 14 }: { platform: Platform; size?: number }) {
  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-3.2.5-4.8s-.1-3.2-.5-4.8ZM9.7 15.1V8.9l6 3.1-6 3.1Z" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
      </svg>
    );
  }
  if (platform === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M16.5 3c.3 2.2 1.6 3.6 3.8 3.8v3.1c-1.4 0-2.7-.4-3.8-1.2v6.2A5.7 5.7 0 1 1 10.8 9.2v3.2a2.6 2.6 0 1 0 2.6 2.6V3h3.1Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The browser's time zone, read after mount so server and client markup match. */
export function useViewerZone(): string | null {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => { setTz(viewerTimeZone() ?? "UTC"); }, []);
  return tz;
}

/** A clock that ticks every `everyMs`, null before mount (same hydration reason). */
export function useNow(everyMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export default function ReadinessPanel({ draft, accounts, onFocusField }: RailProps) {
  const rev = review(draft, accounts);
  return (
    <section className="ov-card cr-card" aria-labelledby="cr-readiness-h">
      <div className="ov-card-head">
        <h2 id="cr-readiness-h">Platform readiness</h2>
        {rev.total > 0 && (
          <span className={`cr-pill ${rev.canSubmit ? "cr-ready" : "cr-neutral"}`}>{rev.readyCount} of {rev.total}</span>
        )}
      </div>
      {rev.rows.length === 0 ? (
        <p className="cr-empty">Choose at least one destination on the left to see what each platform needs.</p>
      ) : (
        <ul className="cr-rows">
          {rev.rows.map((r) => (
            <li key={r.key} className="cr-row">
              <div className="cr-row-head">
                <span className="cr-plat">
                  <PlatformMark platform={r.platform} />
                  {PLATFORM_LABEL[r.platform]}
                  <small>{r.label}</small>
                </span>
                <LevelPill level={r.readiness.level} />
              </div>
              {r.readiness.issues.length > 0 && (
                <ul className="cr-issues">
                  {r.readiness.issues.map((i, idx) => (
                    <li key={`${i.code}-${idx}`} className={`cr-issue cr-${i.severity}`}>
                      {i.field ? (
                        <button type="button" className="cr-issue-btn" onClick={() => onFocusField(r.key, i.field!)}>
                          {i.message}
                        </button>
                      ) : (
                        <span>{i.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
