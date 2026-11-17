"use client";

// Confirming an email address with the code in the email SOCIA sends at
// sign-up (and at a log-in for an address that was never confirmed). The email
// carries the code and the link: either one confirms the address, so a person
// who opens the email on their phone can read the code and type it here on
// their computer. Supabase checks the code (verifyOtp) and signs the person in.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RESEND_WAIT, cleanCode, codeProblem, codeReady, sendProblem } from "@/lib/authEmail";

export default function ConfirmCode({ email, after, emailRedirectTo, startWait = 0, intro, onOtherEmail }: {
  email: string;
  /** Where to go once the address is confirmed. */
  after: string;
  emailRedirectTo: string;
  /** Seconds before "send a new code" may be used (the email was just sent). */
  startWait?: number;
  /** The paragraph under the heading. */
  intro: string;
  onOtherEmail: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(startWait);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!codeReady(code) || loading) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await createClient().auth.verifyOtp({ email, token: code, type: "signup" });
    if (error) {
      setLoading(false);
      setErr(codeProblem(error));
      return;
    }
    router.push(after);
    router.refresh();
  }

  async function resend() {
    if (wait > 0) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await createClient().auth.resend({ type: "signup", email, options: { emailRedirectTo } });
    setLoading(false);
    if (error) {
      setErr(sendProblem(error) ?? "We couldn't send a new code just now. Try again in a minute.");
      return;
    }
    setCode("");
    setMsg(`New code sent to ${email}. Use the newest email.`);
    setWait(RESEND_WAIT);
  }

  return (
    <>
      <h1>Check your email</h1>
      <p className="auth-sub">
        {intro} We sent a code to <b>{email}</b>. It can take a minute to arrive, and it may be in your spam folder.
      </p>

      <form onSubmit={confirm}>
        <label htmlFor="confirm-code">Code from the email</label>
        <div className="field codefield">
          <KeyRound size={18} className="field-ico" aria-hidden />
          <input
            id="confirm-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="123456"
            aria-describedby="confirm-code-help"
          />
        </div>
        <p className="authhelp" id="confirm-code-help">You can also open the link in the email instead.</p>
        <button className="authbtn" type="submit" disabled={loading || !codeReady(code)}>
          {loading ? "Checking…" : <>Confirm email <ArrowRight size={18} aria-hidden /></>}
        </button>
      </form>

      <button className="linkbtn" type="button" onClick={resend} disabled={loading || wait > 0}>
        {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
      </button>
      <button className="linkbtn" type="button" onClick={onOtherEmail}>Use a different email</button>

      {msg && <div className="authmsg ok" role="status">{msg}</div>}
      {err && <div className="authmsg err" role="alert">{err}</div>}
    </>
  );
}
