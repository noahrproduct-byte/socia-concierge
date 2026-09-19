"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import PlatformRows from "./PlatformRows";

export default function ConnectionsManager() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((j) => {
        const p = j.profile;
        if (p && Array.isArray(p.platforms)) setConnected(p.platforms);
      })
      .finally(() => setLoaded(true));
  }, []);

  // Only the platform list is sent. account_connected belongs to the live
  // Instagram connection (its OAuth callback sets it), so registering or
  // removing a platform here must never flip the dashboard's live view.
  async function persist(next: string[], prev: string[], id: string) {
    setPending(id);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Couldn't save that change.");
      }
      setSaved(true);
    } catch (e: unknown) {
      setConnected(prev);
      setErr(e instanceof Error ? e.message : "Couldn't save that change.");
    } finally {
      setPending(null);
    }
  }

  function toggle(id: string) {
    const prev = connected;
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    setConnected(next);
    persist(next, prev, id);
  }

  if (!loaded) return <p className="st2-loading">Loading connections…</p>;

  return (
    <div>
      <PlatformRows connected={connected} pending={pending} onToggle={toggle} exclude={["Instagram", "Facebook"]} />
      {err && (
        <p className="st2-err" role="alert" style={{ marginTop: 10 }}>
          {err}
        </p>
      )}
      <p className="st2-privacy">
        <ShieldCheck size={14} />
        <span>
          {saved
            ? "Saved. Nothing syncs from a registered platform until its API access is approved."
            : "Registering a platform records it for SOCIA. Nothing syncs until that platform's API access is approved."}
        </span>
      </p>
    </div>
  );
}
