"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// The "live" heartbeat: shows a pulsing Live pill with when data last synced,
// re-syncs from Instagram in the background every 2 minutes (and on window
// focus), then refreshes the server-rendered numbers in place. Clicking it
// forces a sync right now.
const INTERVAL_MS = 2 * 60 * 1000;

function ago(iso: string | null, nowMs: number): string {
  if (!iso) return "syncing…";
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function LiveSync({ syncedAt }: { syncedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inflight = useRef(false);

  const sync = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      await fetch("/api/instagram/sync", { method: "POST" });
      router.refresh();
    } catch {
      // next interval retries
    } finally {
      inflight.current = false;
      setTimeout(() => setBusy(false), 500);
    }
  }, [router]);

  useEffect(() => {
    // keep the "Xm ago" label honest
    const label = setInterval(() => setNow(Date.now()), 30_000);
    // background re-sync
    const loop = setInterval(sync, INTERVAL_MS);
    // refresh when the user comes back to the tab and data is over 2 min old
    const onFocus = () => {
      if (!syncedAt || Date.now() - new Date(syncedAt).getTime() > INTERVAL_MS) sync();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(label);
      clearInterval(loop);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync, syncedAt]);

  return (
    <button
      className="live-pill"
      onClick={sync}
      disabled={busy}
      title="Synced from Instagram. Click to refresh now."
    >
      {busy ? <Loader2 size={12} className="spin" /> : <span className="live-dot" />}
      Live · {busy ? "syncing…" : ago(syncedAt, now)}
    </button>
  );
}
