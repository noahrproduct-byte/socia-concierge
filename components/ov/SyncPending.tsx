"use client";

// Connected, not synced: Instagram's OAuth step is done but the first pull of
// the account's profile and posts hasn't completed (or failed). Offers the
// sync itself and the account settings, never a second OAuth round.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, RefreshCw } from "lucide-react";

export default function SyncPending({ username }: { username: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function syncNow() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/instagram/sync", { method: "POST" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setNote(j?.error ?? "Instagram didn't respond. Try again in a minute.");
        return;
      }
      router.refresh();
    } catch {
      setNote("Couldn't reach SOCIA's server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="db-connect">
      <span className="db-connect-ico"><Link2 size={22} /></span>
      <div className="db-connect-copy">
        <h2>Instagram is connected. We haven&apos;t finished syncing yet.</h2>
        <p>
          {username ? `@${username} is linked` : "Your account is linked"}, but SOCIA hasn&apos;t pulled its posts and follower count yet.
          Start the sync here, or manage the connection in <Link href="/settings#accounts" className="ov-link">Settings</Link>.
        </p>
        {note && <p role="alert">{note}</p>}
      </div>
      <button type="button" className="ov-btn primary" onClick={syncNow} disabled={busy}>
        <RefreshCw size={14} className={busy ? "spin" : undefined} /> {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
