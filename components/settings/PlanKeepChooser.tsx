"use client";

// After a downgrade the person may have more active accounts or competitors
// than the plan allows. This lets them choose which stay active; everything
// else is paused, not deleted. Enforcement is in /api/plan/keep, not here.
//
// Accounts are capped PER PLATFORM: a Brand Workspace holds one account on
// each platform, so a plan with N workspaces keeps up to N accounts on
// Instagram, N on YouTube, and so on.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_NAME, type WorkspacePlatform } from "@/lib/plans";

export type KeepAccount = {
  /** ConnectedAccount.id, `${platform}:${platformId}`. */
  id: string;
  label: string;
  handle: string | null;
<<<<<<< HEAD
  platform: "instagram" | "facebook" | "youtube" | "tiktok";
=======
  platform: WorkspacePlatform;
>>>>>>> bdb53ec0343586aa78319c081a9987dde779e021
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
<<<<<<< HEAD

const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
=======
export type KeepAccountsSection = KeepSection<KeepAccount> & {
  /** Platforms that are over the limit, with their active counts. */
  byPlatform: Partial<Record<WorkspacePlatform, number>>;
};
>>>>>>> bdb53ec0343586aa78319c081a9987dde779e021

const compKey = (c: KeepCompetitor) => `${c.platform}:${c.handle}`;

function countOn(sel: Set<string>, items: KeepAccount[], platform: WorkspacePlatform): number {
  return items.filter((a) => a.platform === platform && sel.has(a.id)).length;
}

/** Up to `limit` per platform, the account the app currently reads through first. */
function defaultAccounts(s: KeepAccountsSection): Set<string> {
  const out = new Set<string>();
  const live = s.items.filter((a) => !a.suspended).sort((a, b) => Number(b.current) - Number(a.current));
  const per: Partial<Record<WorkspacePlatform, number>> = {};
  for (const a of live) {
    const n = per[a.platform] ?? 0;
    if (n < s.limit) {
      out.add(a.id);
      per[a.platform] = n + 1;
    }
  }
  return out;
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
  accounts: KeepAccountsSection | null;
  competitors: KeepSection<KeepCompetitor> | null;
}) {
  const router = useRouter();
  const [selA, setSelA] = useState<Set<string>>(() => (accounts ? defaultAccounts(accounts) : new Set()));
  const [selC, setSelC] = useState<Set<string>>(() => (competitors ? defaultCompetitors(competitors) : new Set()));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!accounts && !competitors) return null;

  const toggleAccount = (a: KeepAccount) => {
    if (!accounts) return;
    const next = new Set(selA);
    if (next.has(a.id)) next.delete(a.id);
    else if (countOn(next, accounts.items, a.platform) < accounts.limit) next.add(a.id);
    else return;
    setSelA(next);
  };

  const toggleCompetitor = (key: string) => {
    if (!competitors) return;
    const next = new Set(selC);
    if (next.has(key)) next.delete(key);
    else if (next.size < competitors.limit) next.add(key);
    else return;
    setSelC(next);
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

  const overPlatforms = accounts
    ? (Object.entries(accounts.byPlatform) as [WorkspacePlatform, number][]).map(([p, n]) => `${n} on ${PLATFORM_NAME[p]}`)
    : [];

  return (
    <div className="pb-keep" role="group" aria-label="Choose what to keep active">
      {accounts && (
        <>
          <h4>Choose which accounts stay active</h4>
          <p>
            {planName} includes {countWord(accounts.limit, "Brand Workspace", "Brand Workspaces")}, and a workspace holds one account per
            platform, so up to {accounts.limit} {accounts.limit === 1 ? "account" : "accounts"} on each platform can stay active. You have{" "}
            {overPlatforms.join(" and ")}. Choose which to keep.
          </p>
          <ul className="pb-keep-list">
            {accounts.items.map((a) => {
              const on = selA.has(a.id);
              const full = !on && countOn(selA, accounts.items, a.platform) >= accounts.limit;
              return (
                <li key={a.id}>
                  <label className={`pb-keep-item${full ? " off" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full || saving}
                      onChange={() => toggleAccount(a)}
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
            You are tracking {countWord(competitors.active, "competitor", "competitors")}. {planName} includes{" "}
            {competitors.limit}. Choose {competitors.limit === 1 ? "the one" : `the ${competitors.limit}`} you want to keep.
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
                      onChange={() => toggleCompetitor(key)}
                    />
                    <span>@{c.handle}</span>
                    <span className="pb-keep-meta">{PLATFORM_NAME[c.platform as WorkspacePlatform] ?? c.platform}</span>
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
          {accounts && `${selA.size} ${selA.size === 1 ? "account" : "accounts"} kept`}
          {accounts && competitors && " · "}
          {competitors && `${selC.size} / ${competitors.limit} competitors`}
        </span>
        {err && <span className="pb-keep-err" role="alert">{err}</span>}
      </div>
      <p className="pb-keep-fine">Nothing is deleted. Anything you do not keep is paused and comes back when your plan allows it.</p>
    </div>
  );
}
