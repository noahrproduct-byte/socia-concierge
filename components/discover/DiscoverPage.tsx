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
import { ExternalLink, Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PlanNotice from "@/components/PlanNotice";
import AddCompetitor from "@/components/competitors/AddCompetitor";
import { ReelsToCopy } from "@/components/competitors/TrendingNiche";
import { fmtN } from "@/components/competitors/shared";
import { fmtRate } from "@/lib/metrics";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { PLATFORM_WORD } from "@/lib/discoverStyle";
import type { DiscoverAccount, DiscoverData } from "./types";
import CopyFrom from "./CopyFrom";

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

/** One number on an account card; while it is read, or when the platform didn't share it, it says so rather than showing 0. */
function Stat({ label, value, a, missing = "Not shared" }: { label: string; value: string | null; a: DiscoverAccount; missing?: string }) {
  // "Reading" only before any posts are read: once they are, reading again won't fill a number Instagram doesn't share.
  return (
    <div>
      <dt>{label}</dt>
      <dd className={value == null ? "is-quiet" : undefined}>{value ?? (a.reading && !a.posts.length ? "Reading" : missing)}</dd>
    </div>
  );
}

function AccountCard({ a, action, footer }: { a: DiscoverAccount; action: React.ReactNode; footer?: React.ReactNode }) {
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
      {(followers != null || a.posts.length > 0) && <dl className="dsc-acct-stats">
        <Stat label={a.platform === "youtube" ? "Subscribers" : "Followers"} value={followers != null ? fmtN(followers) : null} a={a} />
        <Stat label="Median views" value={a.medianViews.value != null ? fmtN(Math.round(a.medianViews.value)) : null} a={a} missing={a.posts.length && !reels ? "No Reels" : "Not shared"} />
        <Stat label="Engagement" value={a.engagement.value != null ? fmtRate(a.engagement.value) : null} a={a} />
        <Stat label="Posts a week" value={a.cadence.value != null ? (a.cadence.value >= 10 ? a.cadence.value.toFixed(0) : a.cadence.value.toFixed(1)) : null} a={a} />
      </dl>}
      {a.posts.length > 0 && (
        <p className="dsc-acct-sample">From their last {a.posts.length} posts{reels ? `, ${reels} of them ${a.platform === "youtube" ? "Shorts" : "Reels"}` : ""}. Engagement: likes and comments per post, against followers.</p>
      )}
      <div className="dsc-acct-tags">
        {a.style && <span className={`dsc-tag${a.sameStyle ? " is-same" : ""}`}>{a.style}{a.sameStyle ? ", like yours" : ""}</span>}
        {a.addedBy === "you" && <span className="dsc-tag is-quiet">Added by you</span>}
        {a.addedBy === "socia" && <span className="dsc-tag is-quiet">Picked by SOCIA</span>}
      </div>
      {a.why && !a.posts.length ? <p className="dsc-acct-why">{a.why}</p> : a.why && a.addedBy !== "you" ? <p className="dsc-acct-why">{a.why}</p> : null}
      {status && <p className="dsc-acct-status">{a.reading && <Loader2 size={12} className="cx-spin" aria-hidden />} {status}</p>}
      {footer}
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dropError, setDropError] = useState<{ id: string; text: string } | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const asked = useRef(false);
  const sugRef = useRef<HTMLElement>(null);

  // Read what is missing or old on Instagram in the background, then show it.
  const startRead = useCallback(() => {
    setReading(true); setReadError(null);
    fetch("/api/discover/read", { method: "POST" })
      .then(async (r) => { if (!r.ok) setReadError((await r.json().catch(() => ({}))).error ?? "SOCIA couldn't read the accounts just now."); else router.refresh(); })
      .catch(() => setReadError("SOCIA couldn't read the accounts just now."))
      .finally(() => setReading(false));
  }, [router]);

  // Once per visit, when the page says something is missing.
  useEffect(() => {
    if (!d.needsRead || asked.current) return;
    asked.current = true;
    startRead();
  }, [d.needsRead, startRead]);

  const track = useCallback(async (a: DiscoverAccount) => {
    setBusy(a.id); setNotice(null);
    try {
      const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: a.handle, platform: a.platform }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setNotice(isPlanError(j) ? { id: a.id, plan: j } : { id: a.id, text: j.error ?? "Couldn't track that account." });
        return;
      }
      asked.current = true;
      router.refresh();
      startRead();
    } catch {
      setNotice({ id: a.id, text: "Couldn't reach SOCIA. Try again." });
    } finally { setBusy(null); }
  }, [router, startRead]);

  // Removing a competitor, or saying no to a suggestion: either way SOCIA won't suggest it again.
  const drop = useCallback(async (a: DiscoverAccount) => {
    setBusy(a.id); setDropError(null);
    try {
      const res = await fetch("/api/competitors", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: a.handle, platform: a.platform }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDropError({ id: a.id, text: j.error ?? "Couldn't remove that account. Try again." });
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setDropError({ id: a.id, text: "Couldn't reach SOCIA. Try again." });
    } finally { setBusy(null); }
  }, [router]);

  // "Find accounts like mine": SOCIA's research looks again (lib/discoveryRun.ts), seeded by the
  // competitors tracked and the brand's own video style; then the new ones are read on Instagram.
  const findMore = useCallback(async () => {
    sugRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!d.nicheAccess && d.lastRun) {
      setFound(`Looking again is on ${d.nicheUpgrade ? d.nicheUpgrade[0].toUpperCase() + d.nicheUpgrade.slice(1) : "a paid plan"} and up. Your plan gets one search, which SOCIA already ran.`);
      return;
    }
    setFinding(true); setFound(null);
    try {
      const res = await fetch("/api/competitors/intel?refresh=1");
      const j = (await res.json().catch(() => ({}))) as { error?: string; ranAt?: string | null; nextRefreshAt?: string | null; accounts?: unknown[] };
      if (!res.ok) { setFound(j.error ?? "SOCIA couldn't look just now. Try again in a few minutes."); return; }
      if (j.nextRefreshAt) {
        const at = new Date(j.nextRefreshAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        setFound(`SOCIA looked less than an hour ago, so these are the newest. You can look again after ${at}.`);
        return;
      }
      if (!j.ranAt) { setFound("Add what your business does in Settings so SOCIA knows what to look for."); return; }
      const n = j.accounts?.length ?? 0;
      setFound(n ? `SOCIA looked again and has ${n} account${n === 1 ? "" : "s"} like yours. New ones are read on Instagram now.` : "SOCIA looked again and found no new accounts this time.");
      asked.current = true;
      router.refresh();
      startRead();
    } catch {
      setFound("Couldn't reach SOCIA. Try again.");
    } finally { setFinding(false); }
  }, [d.nicheAccess, d.lastRun, d.nicheUpgrade, router, startRead]);

  const on = d.main ? PLATFORM_WORD[d.main] : "Instagram";
  const full = d.competitors.length >= d.limit;

  return (
    <div className="cx cx2 dsc">
      <PageHeader
        title="Discover"
        sub="Your competitors, the Reels of theirs worth copying, and accounts like them to track next."
        status={reading ? <span className="ov-status"><Loader2 size={12} className="cx-spin" aria-hidden /> Reading your competitors on Instagram</span> : undefined}
        actions={
          <>
            <button type="button" className="ov-btn ghost" disabled={finding} onClick={findMore}>
              {finding ? <Loader2 size={14} className="cx-spin" aria-hidden /> : <Search size={14} aria-hidden />} {finding ? "Looking…" : "Find accounts like mine"}
            </button>
            <button type="button" className="ov-btn primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add competitor</button>
          </>
        }
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
          <span className="cx2-micro">{d.competitors.length} of {d.limit} for this brand</span>
        </div>
        {d.competitors.length === 0 ? (
          <div className="dsc-empty">
            <p>Add the accounts you want to learn from. SOCIA reads their Reels and suggests more like them.</p>
            <button type="button" className="ov-btn primary small" onClick={() => setAddOpen(true)}><Plus size={13} /> Add competitor</button>
          </div>
        ) : (
          <ul className="dsc-accts">
            {d.competitors.map((a) => (
              <AccountCard key={a.id} a={a}
                action={
                  <button type="button" className="ov-btn ghost small dsc-remove" aria-label={`Remove @${a.handle}`} aria-expanded={confirming === a.id} disabled={busy === a.id} onClick={() => { setDropError(null); setConfirming(confirming === a.id ? null : a.id); }}>
                    <Trash2 size={12} aria-hidden /> Remove
                  </button>
                }
                footer={confirming === a.id ? (
                  <div className="dsc-confirm" role="group" aria-label={`Remove @${a.handle}`}
                    onKeyDown={(e) => { if (e.key === "Escape") setConfirming(null); }}>
                    <p>Stop tracking @{a.handle}? Its Reels leave Reels you can copy, it frees a place on your plan, and SOCIA won&apos;t suggest it again. You can add it back any time.</p>
                    <div className="dsc-actions">
                      <button type="button" className="ov-btn small dsc-danger" autoFocus disabled={busy === a.id} onClick={() => drop(a)}>
                        {busy === a.id ? <Loader2 size={12} className="cx-spin" aria-hidden /> : <Trash2 size={12} aria-hidden />} {busy === a.id ? "Removing…" : "Remove"}
                      </button>
                      <button type="button" className="ov-btn ghost small" disabled={busy === a.id} onClick={() => setConfirming(null)}>Keep</button>
                    </div>
                    {dropError?.id === a.id && <p className="dsc-confirm-err" role="alert">{dropError.text}</p>}
                  </div>
                ) : null}
              />
            ))}
          </ul>
        )}
        {d.ownStyle && <p className="dsc-own">Your own Reels read as <b>{d.ownStyle}</b>. Competitors and Reels made the same way come first.</p>}
      </section>

      <CopyFrom accounts={d.copyFrom} limit={d.limit} onChanged={startRead} />

      <ReelsToCopy d={{ nicheAccess: d.nicheAccess, nicheUpgrade: d.nicheUpgrade, now: d.now, reelsToCopy: d.reelsToCopy, nicheReels: d.nicheReels, styleReels: d.styleReels, ownStyle: d.ownStyle, reelsRead: d.reelsRead, ytConfigured: d.ytConfigured, ig: { enabled: d.igEnabled } }} />

      <section ref={sugRef} className="ov-card cx2-card" aria-labelledby="dsc-sug">
        <div className="cx2-card-head">
          <h2 id="dsc-sug">Suggested for you</h2>
          {d.lastRun && <span className="cx2-micro" suppressHydrationWarning>Last looked {new Date(d.lastRun).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
        </div>
        {(finding || found) && <p className="dsc-found" role="status">{finding ? "Looking for accounts like yours. This takes up to a minute." : found}</p>}
        <p className="dsc-lead">Accounts on {on} like the ones you track, doing well{d.ownStyle ? `, ${d.ownStyle.toLowerCase()} ones first` : ""}. Track the ones you want; SOCIA never adds one for you.</p>
        {d.suggestions.length === 0 ? (
          <p className="dsc-empty">{d.lastRun ? "No new suggestions right now. Track a few accounts you like, then ask SOCIA to find more like them." : "SOCIA hasn't looked yet. Choose Find accounts like mine to get suggestions."}</p>
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
