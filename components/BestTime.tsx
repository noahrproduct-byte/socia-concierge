"use client";

// Renders the account's best posting window in the VIEWER's time zone.
// Server components pass raw timestamps; all bucketing happens here so the
// weekday/hour never come out shifted by the server's UTC clock.

import { useEffect, useState } from "react";
import { bestWindow, hourHistogram, type TimedPost } from "@/lib/bestTime";

export default function BestTime({
  posts,
  variant = "short",
  fallback = "—",
  withHistogram = false,
}: {
  posts: TimedPost[];
  variant?: "short" | "long";
  fallback?: string;
  withHistogram?: boolean;
}) {
  // Wait for mount so SSR (UTC) and the browser agree on the rendered text.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <>{fallback}</>;

  const win = bestWindow(posts);
  if (!win) return <>{fallback}</>;

  if (!withHistogram) return <>{variant === "long" ? win.long : win.short}</>;

  const { values, hot } = hourHistogram(posts);
  const max = Math.max(...values) || 1;
  return (
    <>
      {win.short}
      <div className="an2-hours">
        <div className="an2-hours-bars" aria-hidden>
          {values.map((v, i) => (
            <i
              key={i}
              className={i === hot ? "hot" : ""}
              style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
              title={`${i * 2}:00 to ${i * 2 + 2}:00`}
            />
          ))}
        </div>
        <div className="an2-hours-axis" aria-hidden>
          <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>12AM</span>
        </div>
      </div>
    </>
  );
}
