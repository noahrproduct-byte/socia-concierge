"use client";

// The competitors a Content Plan builds on (Noah, 2026-11-14): filled from
// Discover and the Competitors list, each one ticked. Unticking leaves it out
// of this plan only; adding a handle here also saves it to the Competitors
// list (POST /api/competitors, which keeps the plan's limit).
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/system";
import PlanNotice from "@/components/PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { PlanCompetitor } from "@/lib/planEvidence";

function Avatar({ c }: { c: PlanCompetitor }) {
  const [broken, setBroken] = useState(false);
  const letter = (c.name || c.handle).replace(/^@/, "").charAt(0).toUpperCase();
  if (c.avatar && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cpl-cmp-av" src={c.avatar} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}
      // A photo that failed before the page was interactive never fires onError: check once it's mounted.
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true); }} />;
  }
  return <span className="cpl-cmp-av" aria-hidden>{letter}</span>;
}

export default function PlanCompetitors({ list, onList, skip, onSkip, canAdd, platform }: {
  list: PlanCompetitor[];
  onList: (l: PlanCompetitor[]) => void;
  /** Handles left out of this plan. */
  skip: Set<string>;
  onSkip: (s: Set<string>) => void;
  canAdd: boolean;
  /** The form's platform, so a new handle is added on the right one. */
  platform: string;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const used = list.filter((c) => !skip.has(c.handle)).length;

  function toggle(h: string, on: boolean) {
    const next = new Set(skip);
    if (on) next.delete(h); else next.add(h);
    onSkip(next);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (!h) return;
    if (list.some((c) => c.handle === h)) { setMsg(`@${h} is already in the list.`); return; }
    const plat = /youtube/i.test(platform) ? "youtube" : "instagram";
    setBusy(true); setMsg(null); setPlanError(null);
    try {
      const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: h, platform: plat }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isPlanError(json)) setPlanError(json);
        else setMsg(typeof json.error === "string" ? json.error : "Couldn't add that account. Try again.");
        return;
      }
      onList([{ platform: plat, handle: h, name: null, avatar: null, source: "tracked" }, ...list]);
      setHandle("");
      setMsg(`Added @${h} to your competitors.`);
    } catch {
      setMsg("Couldn't add that account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpl-cmp">
      <p className="cpl-cmp-lead">
        {list.length
          ? `SOCIA builds posts on the Reels that took off for these accounts, and skips any an earlier plan already used. Using ${used} of ${list.length}.`
          : "No competitors yet. Add an account below, or find some on Discover."}
      </p>
      {list.length > 0 && (
        <ul className="cpl-cmp-list">
          {list.map((c) => {
            const on = !skip.has(c.handle);
            return (
              <li key={`${c.platform}:${c.handle}`}>
                <label className={`cpl-cmp-row${on ? "" : " off"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle(c.handle, e.target.checked)} />
                  <Avatar c={c} />
                  <span className="cpl-cmp-name">
                    <b>{c.name || `@${c.handle}`}</b>
                    <small>{c.name ? `@${c.handle} · ` : ""}{c.source === "tracked" ? "You follow" : "SOCIA found"}</small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && (
        <form className="cpl-cmp-add" onSubmit={add}>
          <input aria-label="Add a competitor's handle" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={80} autoComplete="off" />
          <Button type="submit" size="sm" busy={busy} disabled={busy || !handle.trim()}>
            <Plus size={14} aria-hidden /> Add
          </Button>
        </form>
      )}
      {msg && <small className="cpl-mix-note" role="status">{msg}</small>}
      {planError && <PlanNotice error={planError} compact />}
      <small className="cpl-mix-note"><Link href="/discover">Find more on Discover</Link></small>
    </div>
  );
}
