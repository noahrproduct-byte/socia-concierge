"use client";

// Discover (Noah, 2026-11-14): "It should only try to copy the reels that are
// from the competitors." Three sections, in this order:
//   Your competitors   the accounts the person tracks, with their picture,
//                      followers and the style of their videos
//   Reels to copy      those competitors' Reels that took off, the person's own
//                      style first (components/competitors/TrendingNiche.tsx)
//   Suggested          accounts like the ones they track, on the platform they
//                      mostly use, to track or dismiss. SOCIA never adds one itself.
// Instagram is read in the background (app/api/discover/read); while it runs, an
// account says it is being read rather than showing a dash as if it were known.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Plus, RefreshCw, Users, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PlanNotice from "@/components/PlanNotice";
import AddCompetitor from "@/components/competitors/AddCompetitor";
import { ReelsToCopy } from "@/components/competitors/TrendingNiche";
import { fmtN } from "@/components/competitors/shared";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { PLATFORM_WORD } from "@/lib/discoverStyle";
import type { DiscoverAccount, DiscoverData } from "./types";

const GATE_WORD: Record<string, string> = {
  not_business: "Not a Business or Creator account, so Instagram shares nothing about it.",
  not_found: "Instagram found no account with this name.",
  connection_needed: "Instagram competitor data needs a linked Facebook Page.",
  unavailable: "Instagram didn't share any posts for this account.",
};

function Avatar({ a }: { a: DiscoverAccount }) {
  const [broken, setBroken] = useState(false);
  const letter = (a.name.replace(/^@/, "")[0] ?? "?").toUpperCase();
  return a.avatar && !broken
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={a.avatar} alt="" className="dsc-avatar" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <span className="dsc-avatar is-letter" aria-hidden>{letter}</span>;
}

function AccountCard({ a, action }: { a: DiscoverAccount; action: React.ReactNode }) {
  const followers = a.audience.value;
  const reels = a.posts.filter((p) => p.format === "Reel" || p.format === "Short").length;
  const status = a.posts.length ? null : a.reading ? "Reading this account on Instagram." : a.postsGate ? GATE_WORD[a.postsGate] ?? null : null;
  return (
    <li className="dsc-acct">
      <div className="dsc-acct-top">
        <Avatar a={a} />
        <div className="dsc-acct-name">
          <b>{a.name}</b>
          <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer">@{a.handle} <ExternalLink size={11} aria-hidden /></a>
        </div>
        {action}
      </div>
      <dl className="dsc-acct-stats">
        <div><dt>{a.platform === "youtube" ? "Subscribers" : "Followers"}</dt><dd>{followers != null ? fmtN(followers) : a.reading ? "Reading" : "Not shared"}</dd></div>
        <div><dt>Reels read</dt><dd>{a.posts.length ? reels : a.reading ? "Reading" : "None"}</dd></div>
      </dl>
      <div className="dsc-acct-tags">
        {a.style && <span className={`dsc-tag${a.sameStyle ? " is-same" : ""}`}>{a.style}{a.sameStyle ? ", like yours" : ""}</span>}
        {a.addedBy === "you" && <span className="dsc-tag is-quiet">Added by you</span>}
        {a.addedBy === "socia" && <span className="dsc-tag is-quiet">Picked by SOCIA</span>}
      </div>
      {a.why && !a.posts.length ? <p className="dsc-acct-why">{a.why}</p> : a.why && a.addedBy !== "you" ? <p className="dsc-acct-why">{a.why}</p> : null}
      {status && <p className="dsc-acct-status">{a.reading && <Loader2 size={12} className="cx-spin" aria-hidden />} {status}</p>}
    </li>
  );
}

export default function DiscoverPage({ d }: { d: DiscoverData }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text?: string; plan?: PlanError } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const asked = useRef(false);

  // One background read per visit for what is missing or old, then the page shows it.
  useEffect(() => {
    if (!d.needsRead || asked.current) return;
    asked.current = true;
    setReading(true);
    fetch("/api/discover/read", { method: "POST" })
      .then(async (r) => { if (!r.ok) setReadError((await r.json().catch(() => ({}))).error ?? "SOCIA couldn't read the accounts just now."); else router.refresh(); })
      .catch(() => setReadError("SOCIA couldn't read the accounts just now."))
      .finally(() => setReading(false));
  }, [d.needsRead, router]);

  const track = useCallback(async (a: DiscoverAccount) => {
    setBusy(a.id); setNotice(null);
    try {
      const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: a.handle, platform: a.platform }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setNotice(isPlanError(j) ? { id: a.id, plan: j } : { id: a.id, text: j.error ?? "Couldn't track that account." });
        return;
      }
      asked.current = false;
      router.refresh();
    } catch {
      setNotice({ id: a.id, text: "Couldn't reach SOCIA. Try again." });
    } finally { setBusy(null); }
  }, [router]);

  // Removing a competitor, or saying no to a suggestion: either way SOCIA won't suggest it again.
  const drop = useCallback(async (a: DiscoverAccount) => {
    setBusy(a.id);
    try {
      await fetch("/api/competitors", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: a.handle, platform: a.platform }) });
      router.refresh();
    } finally { setBusy(null); }
  }, [router]);

  const findMore = useCallback(async () => {
    setFinding(true);
    try { await fetch("/api/competitors/intel?refresh=1"); asked.current = false; router.refresh(); } finally { setFinding(false); }
  }, [router]);

  const on = d.main ? PLATFORM_WORD[d.main] : "Instagram";
  const full = d.competitors.length >= d.limit;

  return (
    <div className="cx cx2 dsc">
      <PageHeader
        title="Discover"
        sub="Your competitors, the Reels of theirs worth copying, and accounts like them to track next."
        status={reading ? <span className="ov-status"><Loader2 size={12} className="cx-spin" aria-hidden /> Reading your competitors on Instagram</span> : undefined}
        actions={<button type="button" className="ov-btn primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add competitor</button>}
      />

      {!d.igEnabled && (
        <div className="dsc-note" role="status">
          <b>SOCIA can&apos;t read Instagram accounts right now.</b> Instagram shares other accounts&apos; profiles and Reels only through a Facebook Page linked to an Instagram Professional account. Link one in Settings, then come back.
        </div>
      )}
      {readError && <div className="dsc-note" role="status">{readError}</div>}

      <section className="ov-card cx2-card" aria-labelledby="dsc-comp">
        <div className="cx2-card-head">
          <h2 id="dsc-comp"><Users size={14} /> Your competitors</h2>
          <span className="cx2-micro">{d.competitors.length} of {d.limit} on your plan</span>
        </div>
        {d.competitors.length === 0 ? (
          <div className="dsc-empty">
            <p>Add the accounts you want to learn from. SOCIA reads their Reels and suggests more like them.</p>
            <button type="button" className="ov-btn primary small" onClick={() => setAddOpen(true)}><Plus size={13} /> Add competitor</button>
          </div>
        ) : (
          <ul className="dsc-accts">
            {d.competitors.map((a) => (
              <AccountCard key={a.id} a={a} action={
                <button type="button" className="dsc-x" aria-label={`Stop tracking @${a.handle}`} title="Stop tracking" disabled={busy === a.id} onClick={() => drop(a)}><X size={14} /></button>
              } />
            ))}
          </ul>
        )}
        {d.ownStyle && <p className="dsc-own">Your own Reels read as <b>{d.ownStyle}</b>. Competitors and Reels made the same way come first.</p>}
      </section>

      <ReelsToCopy d={{ nicheAccess: d.nicheAccess, nicheUpgrade: d.nicheUpgrade, now: d.now, reelsToCopy: d.reelsToCopy, reelsRead: d.reelsRead, ytConfigured: d.ytConfigured, ig: { enabled: d.igEnabled } }} />

      <section className="ov-card cx2-card" aria-labelledby="dsc-sug">
        <div className="cx2-card-head">
          <h2 id="dsc-sug">Suggested for you</h2>
          <button type="button" className="ov-btn ghost small" disabled={finding} onClick={findMore}>
            <RefreshCw size={12} className={finding ? "cx-spin" : undefined} aria-hidden /> {finding ? "Looking…" : "Find more"}
          </button>
        </div>
        <p className="dsc-lead">Accounts on {on} like the ones you track, doing well{d.ownStyle ? `, ${d.ownStyle.toLowerCase()} ones first` : ""}. Track the ones you want; SOCIA never adds one for you.</p>
        {d.suggestions.length === 0 ? (
          <p className="dsc-empty">{d.lastRun ? "No new suggestions right now. Track a few accounts you like, then ask SOCIA to find more like them." : "SOCIA hasn't looked yet. Find more to get suggestions."}</p>
        ) : (
          <ul className="dsc-accts">
            {d.suggestions.map((a) => (
              <AccountCard key={a.id} a={a} action={
                <div className="dsc-actions">
                  <button type="button" className="ov-btn primary small" disabled={busy === a.id || full} title={full ? "Your plan's competitor limit is reached" : undefined} onClick={() => track(a)}><Plus size={12} /> Track</button>
                  <button type="button" className="dsc-x" aria-label={`Not for me: @${a.handle}`} title="Not for me" disabled={busy === a.id} onClick={() => drop(a)}><X size={14} /></button>
                </div>
              } />
            ))}
          </ul>
        )}
        {notice && (notice.plan ? <PlanNotice error={notice.plan} compact /> : <p className="dsc-note">{notice.text}</p>)}
      </section>

      <AddCompetitor open={addOpen} onClose={() => setAddOpen(false)} tracked={d.tracked} suggestions={d.suggestions} />
    </div>
  );
}
