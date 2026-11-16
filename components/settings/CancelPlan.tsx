"use client";

// Settings, Plan & billing: cancelling a plan. Two short steps before Stripe's
// own cancel page: why (required), then a little more for staying
// (lib/retention/core.ts). Cancelling is always one click away on each step,
// and nothing here cancels by itself: Stripe's page does, at the end of the
// paid period.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Dialog, Field, Textarea } from "@/components/system";
import { detailRequired, type ReasonId } from "@/lib/retention/core";

type Info = { canCancel: boolean; plan: string; periodEnd: string | null; reasons: { id: ReasonId; label: string }[]; offer: { credits: number; buys: string } | null };
type Step = "why" | "offer" | "stayed";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function CancelPlan() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [step, setStep] = useState<Step>("why");
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "stay" | "cancel">(null);
  const [gotCredits, setGotCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!open || info) return;
    let alive = true;
    fetch("/api/billing/cancel").then((r) => r.json()).then((j: Info) => { if (alive) setInfo(j); }).catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [open, info]);

  function start() {
    setStep("why"); setReason(null); setDetail(""); setErr(null); setGotCredits(null); setOpen(true);
  }

  function next() {
    if (!reason) { setErr("Choose a reason first."); return; }
    if (detailRequired(reason) && detail.trim().length < 3) { setErr("Tell us the reason in a few words."); return; }
    setErr(null); setStep("offer");
  }

  async function send(choice: "stay" | "cancel") {
    if (!reason) { setStep("why"); setErr("Choose a reason first."); return; }
    setBusy(choice); setErr(null);
    try {
      const r = await fetch("/api/billing/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason, detail, choice }) });
      const j = (await r.json().catch(() => null)) as { url?: string; stayed?: boolean; credits?: number | null; error?: string } | null;
      if (!r.ok) throw new Error(j?.error || "That didn't go through. Try again.");
      if (choice === "cancel") {
        if (!j?.url) throw new Error("Stripe's cancel page couldn't be opened. Use Manage billing to cancel instead.");
        window.location.assign(j.url);
        return;
      }
      setGotCredits(j?.credits ?? null);
      setStep("stayed");
      setBusy(null);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  const title = step === "why" ? "Cancel your plan" : step === "offer" ? (info?.offer ? "Stay and get extra credits" : "Cancel your plan") : "You're staying";
  const actions =
    step === "why" ? (
      <>
        <Button onClick={() => setOpen(false)}>Keep my plan</Button>
        <Button variant="primary" onClick={next} disabled={!info}>Continue</Button>
      </>
    ) : step === "offer" ? (
      <>
        <Button onClick={() => void send("cancel")} busy={busy === "cancel"} disabled={busy !== null}>Continue to cancel</Button>
        <Button variant="primary" onClick={() => void send("stay")} busy={busy === "stay"} disabled={busy !== null}>{info?.offer ? "Stay and get the credits" : "Keep my plan"}</Button>
      </>
    ) : (
      <Button variant="primary" onClick={() => { setOpen(false); window.location.reload(); }}>Done</Button>
    );

  return (
    <>
      <button type="button" className="cancel-link" onClick={start}>Cancel plan</button>
      <Dialog open={open} onOpenChange={(o) => { if (busy === null) setOpen(o); }} title={title} width={520} className="cancel" actions={actions}>
        {loadErr && <p className="cancel-note" role="alert">This couldn&apos;t be loaded. Close it and try again, or use Manage billing.</p>}
        {!info && !loadErr && <p className="cancel-note" role="status"><Loader2 size={14} className="spin" aria-hidden /> Loading.</p>}
        {info && step === "why" && (
          <>
            <fieldset className="cancel-reasons">
              <legend>Why are you cancelling? Choose one.</legend>
              {info.reasons.map((r) => (
                <label key={r.id}>
                  <input type="radio" name="cancel-reason" value={r.id} checked={reason === r.id} onChange={() => { setReason(r.id); setDetail(""); setErr(null); }} />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            {/* Words are asked for only where they are needed: "something else" has to say what, and a missing feature can be named. */}
            {reason && (detailRequired(reason) || reason === "missing_feature") && (
              <Field label={detailRequired(reason) ? "What is the reason?" : "What is missing?"} optional={!detailRequired(reason)}>
                <Textarea rows={2} maxLength={500} value={detail} onChange={(e) => { setDetail(e.target.value); setErr(null); }} />
              </Field>
            )}
          </>
        )}
        {info && step === "offer" && (info.offer ? (
          <>
            <p className="cancel-note">Stay on {info.plan} and {info.offer.credits.toLocaleString("en-US")} AI credits are added to your balance. That is {info.offer.buys}.</p>
            <p className="cancel-note">They don&apos;t expire at the end of the month. Your price doesn&apos;t change, and you can still cancel whenever you want.</p>
          </>
        ) : (
          <p className="cancel-note">
            You finish cancelling on Stripe&apos;s page.{info.periodEnd ? ` You keep ${info.plan} until ${day(info.periodEnd)}, and you aren't charged again.` : ""}
          </p>
        ))}
        {info && step === "stayed" && (
          <p className="cancel-note" role="status">
            {gotCredits ? `Your plan stays as it is, and ${gotCredits.toLocaleString("en-US")} AI credits were added to your balance.` : "Your plan stays as it is. Nothing was changed."}
          </p>
        )}
        {err && <p className="cancel-err" role="alert">{err}</p>}
      </Dialog>
    </>
  );
}
