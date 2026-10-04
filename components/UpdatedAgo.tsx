"use client";

// "Platform data updated 3 min ago". Live platform numbers are reused for a few
// minutes (lib/liveCache.ts); this says how old the ones on screen are. The
// relative time is worked out in the browser after mount, so the server and
// client markup never disagree.

import { useEffect, useState } from "react";

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m === 1 ? "1 min ago" : `${m} min ago`;
}

export default function UpdatedAgo({ at }: { at: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!at || now == null) return null;
  return (
    <small className="upd-ago" title={`Fetched from the platforms at ${new Date(at).toLocaleTimeString()}. Reused for up to 15 minutes.`}>
      Platform data updated {ago(at, now)}
    </small>
  );
}
