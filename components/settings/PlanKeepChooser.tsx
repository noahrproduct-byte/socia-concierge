"use client";

// After a downgrade the person may have more active accounts or competitors
// than the plan allows. This lets them choose which stay active; everything
// else is paused, not deleted. Enforcement is in /api/plan/keep, not here.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KeepAccount = {
  /** ConnectedAccount.id, `${platform}:${platformId}`. */
  id: string;
  label: string;
  handle: string | null;
  platform: "instagram" | "facebook" | "youtube" | "tiktok";
  suspended: boolean;
  /** Instagram only: the account the app currently reads through. */
  current: boolean;
};

export type KeepCompetitor = {
  platform: string;
  handle: string;
  active: boolean;
};

export type KeepSection<T> = { limit: number; active: number; items: T[] };

const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };

const compKey = (c: KeepCompetitor) => `${c.platform}:${c.handle}`;

function defaultAccounts(s: KeepSection<KeepAccount>): Set<string> {
  const live = s.items.filter((a) => !a.suspended);
  live.sort((a, b) => Number(b.current) - Number(a.current));
  return new Set(live.slice(0, s.limit).map((a) => a.id));
}

function defaultCompetitors(s: KeepSection<KeepCompetitor>): Set<string> {
  return new Set(s.items.filter((c) => c.active).slice(0, s.limit).map(compKey));
}

function countWord(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function PlanKeepChooser({
  planName,
  accounts,
  competitors,
}: {
  planName: string;
  accounts: KeepSection<KeepAccount> | null;
  competitors: KeepSection<KeepCompetitor> | null;
}) {
  const router = useRouter();
  const [selA, setSelA] = useState<Set<string>>(() => (accounts ? defaultAccounts(accounts) : new Set()));
  const [selC, setSelC] = useState<Set<string>>(() => (competitors ? defaultCompetitors(competitors) : new Set()));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!accounts && !competitors) return null;

  const toggle = (set: Set<string>, key: string, limit: number, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else if (next.size < limit) next.add(key);
    else return;
    apply(next);
  };

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const body: { accounts?: string[]; competitors?: string[] } = {};
      if (accounts) body.accounts = Array.from(selA);
      if (competitors) body.competitors = Array.from(selC);
      const res = await fetch("/api/plan/keep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? "Your choice could not be saved. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setErr("Your choice could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const chosenWord = (limit: number) => (limit === 1 ? "the one" : `the ${limit}`);

  return (
    <div className="pb-keep" role="group" aria-label="Choose what to keep active">
      {accounts && (
        <>
          <h4>Choose which accounts stay active</h4>
          <p>
            You currently have {countWord(accounts.active, "connected account", "connected accounts")}. {planName} supports{" "}
            {accounts.limit}. Choose {chosenWord(accounts.limit)} you want to keep active.
          </p>
          <ul className="pb-keep-list">
            {accounts.items.map((a) => {
              const on = selA.has(a.id);
              const full = !on && selA.size >= accounts.limit;
              return (
                <li key={a.id}>
                  <label className={`pb-keep-item${full ? " off" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full || saving}
                      onChange={() => toggle(selA, a.id, accounts.limit, setSelA)}
                    />
                    <span>{a.label}</span>
                    {a.handle && a.label !== `@${a.handle}` && <span className="pb-keep-meta">@{a.handle}</span>}
                    <span className="pb-keep-meta">{PLATFORM_NAME[a.platform] ?? a.platform}</span>
                    {a.suspended && <span className="pb-keep-tag">Paused</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {competitors && (
        <>
          <h4>Choose which competitors stay tracked</h4>
          <p>
            You currently have {countWord(competitors.active, "competitor", "competitors")}. {planName} supports{" "}
            {competitors.limit}. Choose {chosenWord(competitors.limit)} you want to keep.
          </p>
          <ul className="pb-keep-list">
            {competitors.items.map((c) => {
              const key = compKey(c);
              const on = selC.has(key);
              const full = !on && selC.size >= competitors.limit;
              return (
                <li key={key}>
                  <label className={`pb-keep-item${full ? " off" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full || saving}
                      onChange={() => toggle(selC, key, competitors.limit, setSelC)}
                    />
                    <span>@{c.handle}</span>
                    <span className="pb-keep-meta">{PLATFORM_NAME[c.platform] ?? c.platform}</span>
                    {!c.active && <span className="pb-keep-tag">Paused</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="pb-keep-foot">
        <button type="button" className="btn-primary sm" onClick={submit} disabled={saving}>
          {saving ? "Saving" : "Keep selected"}
        </button>
        <span className="pb-keep-count">
          {accounts && `${selA.size} / ${accounts.limit} accounts`}
          {accounts && competitors && " · "}
          {competitors && `${selC.size} / ${competitors.limit} competitors`}
        </span>
        {err && <span className="pb-keep-err" role="alert">{err}</span>}
      </div>
      <p className="pb-keep-fine">Nothing is deleted. Anything you do not keep is paused and comes back when your plan allows it.</p>
    </div>
  );
}
