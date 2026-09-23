"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import PlatformRows from "./PlatformRows";

export default function ConnectionsManager() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((j) => {
        const p = j.profile;
        if (p && Array.isArray(p.platforms)) setConnected(p.platforms);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function persist(next: string[], id: string) {
    setPending(id);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: next, account_connected: next.length > 0 }),
      });
      setSaved(true);
    } finally {
      setPending(null);
    }
  }

  function toggle(id: string) {
    const next = connected.includes(id) ? connected.filter((x) => x !== id) : [...connected, id];
    setConnected(next);
    persist(next, id);
  }

  if (!loaded) return <p className="st2-loading">Loading connections…</p>;

  return (
    <div>
      <PlatformRows connected={connected} pending={pending} onToggle={toggle} exclude={["Instagram", "Facebook", "YouTube"]} />
      <p className="st2-privacy">
        <ShieldCheck size={14} />
        <span>
          {saved
            ? "Saved — live data sync switches on as each platform approves our API access."
            : "Connecting registers the account so your dashboard reflects it. Live data sync arrives as each platform approves our API access."}
        </span>
      </p>
    </div>
  );
}
