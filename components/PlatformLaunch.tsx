"use client";

// A platform SOCIA isn't connecting yet (TikTok, Facebook): its status, a
// countdown only when the launch date is confirmed (lib/platformLaunch.ts), a
// short explanation, "Notify me when it opens" and the contact address. The
// countdown is drawn after the page loads, from one absolute instant, so it
// never restarts on a refresh and reads the same on every device.

import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { ACCOUNTS } from "./ConnectAccounts";
import { CONTACT_EMAIL, platformRequestHref, type OfflinePlatform } from "@/lib/platformStatus";
import { LAUNCH_COPY, countdownParts, launchPhase, launchWhen } from "@/lib/platformLaunch";

const NAME: Record<OfflinePlatform, string> = { tiktok: "TikTok", facebook: "Facebook" };
const WHAT: Record<OfflinePlatform, string> = {
  tiktok: "Bring in your TikTok videos and stats, and schedule posts to TikTok from SOCIA.",
  facebook: "Bring in your Facebook Page's posts and stats, and schedule posts to your Page from SOCIA.",
};

// One request for every card on the page.
let waitlist: Promise<{ platforms: string[]; ready: boolean } | null> | null = null;
const loadWaitlist = () => (waitlist ??= fetch("/api/platform-waitlist").then((r) => (r.ok ? r.json() : null)).catch(() => null));

function Num({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="pl-num">
      <b key={value}>{String(value).padStart(2, "0")}</b>
      <small>{value === 1 ? unit : `${unit}s`}</small>
    </span>
  );
}

export default function PlatformLaunch({ platform, at, signedIn = true, compact = false }: {
  platform: OfflinePlatform;
  /** the confirmed launch instant, or null when there isn't one */
  at: string | null;
  signedIn?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!at) return;
    // Minutes are the smallest unit shown: a tick every 15 seconds keeps it exact without busy work.
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [at]);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void loadWaitlist().then((w) => { if (alive && w) setOn(w.ready ? w.platforms.includes(platform) : null); });
    return () => { alive = false; };
  }, [platform, signedIn]);

  const toggle = async () => {
    setBusy(true); setNote(null);
    const want = !on;
    const res = await fetch("/api/platform-waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, on: want }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { platforms?: string[]; error?: string } | null) : null;
    if (res?.ok && j?.platforms) { setOn(j.platforms.includes(platform)); waitlist = Promise.resolve({ platforms: j.platforms, ready: true }); }
    else setNote(j?.error ?? "Couldn't save that. Try again.");
    setBusy(false);
  };

  const phase = now == null ? null : launchPhase(at, now);
  const mark = ACCOUNTS.find((a) => a.id.toLowerCase() === platform);
  const parts = phase?.kind === "countdown" ? countdownParts(phase.remainingMs) : null;

  return (
    <section className={`pl${compact ? " is-compact" : ""}`} aria-label={`${NAME[platform]} integration`}>
      <div className="pl-head">
        <span className="pl-icon" aria-hidden>{mark?.mark(platform === "tiktok" ? "currentColor" : mark.color, 18)}</span>
        <b className="pl-name">{NAME[platform]}</b>
        <span className="pl-status">{phase?.kind === "countdown" ? LAUNCH_COPY.countdown : phase?.kind === "late" ? "Delayed" : "Coming soon"}</span>
      </div>

      {parts && phase?.kind === "countdown" ? (
        <div className="pl-count">
          <p className="pl-clock" role="timer" aria-label={`Opens in ${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes`}>
            <Num value={parts.days} unit="day" /><Num value={parts.hours} unit="hour" /><Num value={parts.minutes} unit="minute" />
          </p>
          <small className="pl-when">Opens {launchWhen(phase.at)}, your time.</small>
        </div>
      ) : (
        <p className="pl-wait">{phase?.kind === "late" ? LAUNCH_COPY.late : LAUNCH_COPY.awaiting}</p>
      )}

      {!compact && <p className="pl-what">{WHAT[platform]} Instagram and YouTube work now.</p>}

      <div className="pl-actions">
        {signedIn && on !== null && (
          <button type="button" className={`ov-btn ${on ? "ghost" : "primary"} small`} onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
            {on ? <><Check size={13} aria-hidden /> We&apos;ll email you when it opens</> : <><Bell size={13} aria-hidden /> Notify me when it opens</>}
          </button>
        )}
        {signedIn && on && <button type="button" className="pl-undo" onClick={() => void toggle()} disabled={busy}><BellOff size={12} aria-hidden /> Stop</button>}
        <small className="pl-contact">Questions? <a href={platformRequestHref(platform)}>{CONTACT_EMAIL}</a></small>
      </div>
      {note && <p className="pl-note" role="alert">{note}</p>}
    </section>
  );
}
