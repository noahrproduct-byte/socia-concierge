"use client";

// "Worth posting again" (repurposing, Growth and up): the account's best
// recent posts that aren't on its other connected platforms yet. One click
// copies the post's media into a draft for those platforms and opens it in
// Create post, where SOCIA writes a fresh caption for each platform. The
// rows come from lib/repurpose.ts; nothing is published from here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat2, Film, Image as ImageIcon, Loader2, ArrowUpRight } from "lucide-react";
import { fmtMultiplier } from "@/lib/multiplier";
import { markRepurposeCaptions } from "@/lib/repurposeHandoff";
import type { Candidate } from "@/lib/repurpose";
import type { Platform } from "@/lib/publishing/types";

const NAME: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook" };
const list = (ps: Platform[]) => {
  const n = ps.map((p) => NAME[p]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} or ${n[n.length - 1]}`;
};
const both = (ps: Platform[]) => {
  const n = ps.map((p) => NAME[p]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

export default function RepurposeCard({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);

  async function repurpose(c: Candidate) {
    setBusy(c.key);
    setError(null);
    try {
      const res = await fetch("/api/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: c.ref, platforms: c.targets }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.postId) {
        setError({ key: c.key, text: j.error ?? "SOCIA couldn't make the draft. Try again in a moment." });
        setBusy(null);
        return;
      }
      markRepurposeCaptions(j.postId);
      router.push(`/create?post=${encodeURIComponent(j.postId)}`);
    } catch {
      setError({ key: c.key, text: "SOCIA couldn't make the draft. Check your connection and try again." });
      setBusy(null);
    }
  }

  return (
    <section className="ov-card rp" aria-labelledby="rp-h">
      <div className="ov-card-head">
        <div>
          <h2 id="rp-h"><span className="ov-h-ico primary"><Repeat2 size={14} /></span> Worth posting again</h2>
          <p className="ov-card-sub">Your best recent posts that aren&apos;t on your other platforms yet. One click makes a draft with a caption written for each one.</p>
        </div>
      </div>
      <ul className="rp-list">
        {candidates.map((c) => (
          <li key={c.key} className="rp-row">
            {c.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.thumb} alt="" width={48} height={48} className="rp-thumb" />
            ) : <span className="rp-thumb ph">{c.kind === "image" ? <ImageIcon size={16} /> : <Film size={16} />}</span>}
            <span className="rp-body">
              <b>{c.title}</b>
              <small>
                {fmtMultiplier(c.multiplier)} your median {NAME[c.from]} {c.metric === "views" ? "views" : "engagement"} ({c.sample} posts)
                {" · "}{new Date(c.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {c.permalink && <> {" · "}<a href={c.permalink} target="_blank" rel="noopener noreferrer">See it <ArrowUpRight size={11} /></a></>}
              </small>
              <small className="rp-where">
                {c.checked.length ? `Not found on your ${list(c.checked)}.` : null}
                {c.checked.length < c.targets.length ? `${c.checked.length ? " " : ""}${both(c.targets.filter((p) => !c.checked.includes(p)))}: SOCIA couldn't check.` : null}
              </small>
              {error?.key === c.key && <small className="rp-err" role="alert">{error.text}</small>}
            </span>
            <button type="button" className="td-cta rp-go" disabled={busy !== null} onClick={() => void repurpose(c)}>
              {busy === c.key ? <><Loader2 size={12} className="cp-spin" /> Copying</> : <>Post to {both(c.targets)}</>}
            </button>
          </li>
        ))}
      </ul>
      <small className="ov-source">Measured against your own median on each platform over the last 90 days. A post counts as already there when SOCIA sent it there or finds the same caption.</small>
    </section>
  );
}
