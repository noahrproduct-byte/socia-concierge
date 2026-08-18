"use client";

import { useEffect, useState } from "react";
import ConnectAccounts from "./ConnectAccounts";

export default function ConnectionsManager() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function persist(next: string[]) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: next, account_connected: next.length > 0 }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    const next = connected.includes(id) ? connected.filter((x) => x !== id) : [...connected, id];
    setConnected(next);
    persist(next);
  }

  if (!loaded) return <p className="page-sub">Loading connections…</p>;

  return (
    <div>
      <ConnectAccounts connected={connected} onToggle={toggle} exclude={["Instagram"]} />
      <p className="onb-connect-note">
        {saving
          ? "Saving…"
          : saved
            ? "Saved ✓ — live data sync switches on as each platform approves our API access."
            : "Connecting registers the account so your dashboard reflects it. Live data sync arrives as each platform approves our API access."}
      </p>
    </div>
  );
}
