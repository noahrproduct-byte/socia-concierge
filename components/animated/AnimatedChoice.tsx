"use client";

// "Post animated videos": the brand's choice and how many a day, beside SOCIA's
// honest read of whether it suits the account (lib/animated/fit.ts). Used in
// sign-up and in Settings. When on, every content plan gets that many animated
// posts a day on top of the filmed ones, and "Generate animated videos" makes them.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, SegmentedControl, Switch } from "@/components/system";
import { VERDICT_LABEL, type AnimatedFit } from "@/lib/animated/fitCore";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? "SOCIA didn't answer. Check your connection and try again.");
  return j as T;
}

export default function AnimatedChoice({ autoScan = false, canEdit = true }: { autoScan?: boolean; canEdit?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [perDay, setPerDay] = useState<1 | 2>(1);
  const [fit, setFit] = useState<AnimatedFit | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef(false);

  const scan = useCallback(async () => {
    setScanning(true); setErr(null);
    try {
      const r = await call<{ on: boolean; fit: AnimatedFit }>("/api/animated/fit", { method: "POST" });
      setFit(r.fit); setOn(r.on);
    } catch (e) { setErr((e as Error).message); } finally { setScanning(false); }
  }, []);

  useEffect(() => {
    call<{ on: boolean; perDay?: 1 | 2; fit: AnimatedFit | null }>("/api/animated/fit")
      .then((r) => {
        setOn(r.on); setFit(r.fit); setPerDay(r.perDay === 2 ? 2 : 1);
        // In sign-up, check the account once when nothing has been checked yet.
        if (autoScan && canEdit && !r.fit && !asked.current) { asked.current = true; void scan(); }
      })
      .catch((e) => setErr((e as Error).message));
  }, [autoScan, canEdit, scan]);

  async function save(patch: { on?: boolean; perDay?: 1 | 2 }) {
    setSaving(true); setErr(null);
    try {
      await call("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand_detail: { animated: patch } }) });
      if (patch.on != null) setOn(patch.on);
      if (patch.perDay) setPerDay(patch.perDay);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="anc">
      <div className="anc-row">
        <div className="anc-text">
          <b>Post animated videos</b>
          <span>Short animated vertical videos, such as side-by-side comparisons, counters or words on screen. No filming: SOCIA writes them into every content plan, on top of your filmed posts, and makes them in your browser. You see each week&apos;s videos before they&apos;re scheduled.</span>
        </div>
        {on != null && <Switch checked={on} disabled={!canEdit || saving} onCheckedChange={(v) => void save({ on: v })} label="Post animated videos" />}
      </div>
      {on && (
        <SegmentedControl label="How many a day" value={String(perDay)}
          options={[{ value: "1", label: "One a day", disabled: !canEdit || saving }, { value: "2", label: "Two a day", disabled: !canEdit || saving }]}
          onChange={(v) => void save({ perDay: v === "2" ? 2 : 1 })} />
      )}
      {scanning && <p className="anc-note" role="status"><Loader2 size={13} className="spin" aria-hidden /> Checking whether they suit your account.</p>}
      {!scanning && fit && (
        <div className={`anc-fit is-${fit.verdict}`}>
          <b>{VERDICT_LABEL[fit.verdict]}</b>
          <ul>{fit.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <small>
            From your niche{fit.postsRead ? `, your last ${fit.postsRead} posts` : ""} and what works in your niche, checked {new Date(fit.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. It&apos;s a read, not a promise; the choice is yours.
          </small>
        </div>
      )}
      {!scanning && canEdit && (
        <Button size="sm" onClick={() => void scan()}>{fit ? "Check again" : "Check my account"}</Button>
      )}
      {err && <p className="anc-note is-error" role="alert">{err}</p>}
    </div>
  );
}
