"use client";

// Settings, Invite a friend: the person's own invite link, what their
// invitations have brought so far, and the rule in one sentence
// (lib/referrals/core.ts). Everything shown is counted on the server; nothing
// here is an estimate.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Input } from "@/components/system";

type Data = {
  enabled: boolean; link?: string; invited?: number; counting?: number; waiting?: number;
  bonus?: { active: number; until: string | null };
  rules?: { reward: string; days: number; max: number };
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function InviteFriends() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/referrals").then((r) => r.json()).then((j: Data) => { if (alive) setData(j); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  async function copy() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused: select the link so it can be copied by hand.
      (document.getElementById("invite-link") as HTMLInputElement | null)?.select();
    }
  }

  if (failed) return <p className="invite-note" role="alert">Your invite link couldn&apos;t be loaded. Reload the page to try again.</p>;
  if (!data) return <p className="invite-note" role="status"><Loader2 size={14} className="spin" aria-hidden /> Loading your invite link.</p>;
  if (!data.enabled || !data.link || !data.rules) return <p className="invite-note">Invitations aren&apos;t available yet.</p>;
  const { rules, bonus } = data;
  return (
    <div className="invite">
      <p className="invite-note">
        When a friend signs up with your link and connects a social account, you both get {rules.reward} for {rules.days} days. Up to {rules.max} invitations can count at once.
      </p>
      <div className="invite-row">
        <Input id="invite-link" aria-label="Your invite link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
      </div>
      <p className="invite-note" role="status">
        {data.invited === 0
          ? "Nobody has signed up with your link yet."
          : `${data.invited} signed up with your link: ${data.counting} connected an account, ${data.waiting} ${data.waiting === 1 ? "hasn't" : "haven't"} yet.`}
        {bonus && bonus.active > 0 && bonus.until ? ` ${bonus.active} ${bonus.active === 1 ? "invitation counts" : "invitations count"} right now, until ${day(bonus.until)}.` : ""}
      </p>
    </div>
  );
}
