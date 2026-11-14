"use client";

// Settings: what SOCIA knows about the account (components/brand/BrandRead.tsx),
// saved when the person confirms it, and read again on request. Reading again
// watches the Reels and the captions afresh and uses one account audit.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/system";
import PlanNotice from "@/components/PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { Understanding } from "@/lib/intel/understanding";
import type { BrandDetail } from "@/lib/profile";
import BrandRead, { brandReadToSave, seedBrandRead, type BrandReadValue } from "./BrandRead";

export default function BrandReadCard({ initial, thumbs, canEdit, connected }: { initial: BrandDetail | null; thumbs: Record<string, string>; canEdit: boolean; connected: boolean }) {
  const [understanding, setUnderstanding] = useState<Understanding | null>(initial?.growth?.understanding ?? null);
  const [value, setValue] = useState<BrandReadValue>(() => seedBrandRead(initial?.growth?.understanding?.visual, initial, thumbs));
  const [saved, setSaved] = useState(JSON.stringify(brandReadToSave(value)));
  const confirmed = Boolean(initial?.description || initial?.formats?.length);
  const [isConfirmed, setIsConfirmed] = useState(confirmed);
  const [busy, setBusy] = useState<"save" | "read" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const dirty = JSON.stringify(brandReadToSave(value)) !== saved;

  async function save() {
    setBusy("save"); setMsg(null);
    const body = brandReadToSave(value);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_detail: body }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setMsg(j?.error || "Couldn't save. Try again."); return; }
      setSaved(JSON.stringify(body));
      setIsConfirmed(true);
      setMsg("Saved. Plans and videos are written from this now.");
    } catch {
      setMsg("Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function readAgain() {
    setBusy("read"); setMsg(null); setPlanError(null);
    try {
      const r = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        if (isPlanError(j)) setPlanError(j);
        else setMsg(j?.error || "SOCIA couldn't read your account just now. Try again in a minute.");
        return;
      }
      const u = (j?.understanding ?? null) as Understanding | null;
      setUnderstanding(u);
      // A fresh read fills the form again; nothing is saved until the person confirms it.
      setValue(seedBrandRead(u?.visual, { ...initial, description: undefined, formats: undefined, look: undefined }, {}));
      setMsg(u?.visual ? "Read again. Check it, then save." : "Read your captions again, but SOCIA couldn't watch your Reels this time.");
    } catch {
      setMsg("SOCIA couldn't read your account just now. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="br-card">
      {!isConfirmed && (understanding?.visual || value.description) && (
        <p className="br-banner">SOCIA filled this in from your account. Check it and save it, so plans and videos are about the right things.</p>
      )}
      {busy === "read" ? (
        <p className="br-reading" role="status"><Loader2 size={16} className="spin" aria-hidden /> Watching your Reels and reading your captions. This takes about a minute.</p>
      ) : (
        <BrandRead visual={understanding?.visual} value={value} onChange={setValue} />
      )}
      {planError && <PlanNotice error={planError} compact />}
      {msg && <p className="br-note" role="status">{msg}</p>}
      {canEdit && (
        <div className="br-actions">
          <Button variant="primary" size="sm" onClick={save} busy={busy === "save"} disabled={busy !== null || (!dirty && isConfirmed)}>
            {isConfirmed && !dirty ? "Saved" : "This is right, save it"}
          </Button>
          {connected && (
            <Button size="sm" variant="ghost" onClick={readAgain} disabled={busy !== null}>
              Watch my Reels again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
