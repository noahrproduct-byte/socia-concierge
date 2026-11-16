"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";
import { RESEND_WAIT, alreadyRegistered, sendProblem } from "@/lib/authEmail";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The address a confirmation link was sent to: the form gives way to "check your email".
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Seconds until another link may be sent (the email service allows one a minute per address).
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Already signed in? Straight to the app instead of a signup form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setErr(sendProblem(error) ?? error.message);
      return;
    }
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else if (alreadyRegistered(data.user)) {
      // Nothing was sent: this address already has an account.
      setErr("That email already has a SOCIA account. Log in instead, or reset your password from the log-in page.");
    } else {
      setSentTo(email);
      setWait(RESEND_WAIT);
    }
  }

  async function resend() {
    if (!sentTo || wait > 0) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setLoading(false);
    if (error) {
      setErr(sendProblem(error) ?? "We couldn't send the link just now. Try again in a minute.");
      return;
    }
    setMsg(`Sent again to ${sentTo}.`);
    setWait(RESEND_WAIT);
  }

  async function signUpWithGoogle() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  if (sentTo) {
    return (
      <AuthShell>
        <div className="auth-mobilelogo">
          <BrandMark size={32} />SOCIA
        </div>

        <h1>Check your email</h1>
        <p className="auth-sub">
          We sent a confirmation link to <b>{sentTo}</b>. Open it to confirm your address and finish signing up. It can take a minute to arrive, and it may be in your spam folder.
        </p>

        <button className="authbtn" type="button" onClick={resend} disabled={loading || wait > 0}>
          {loading ? "Sending…" : wait > 0 ? `Send it again in ${wait}s` : "Send the link again"}
        </button>
        <button className="linkbtn" type="button" onClick={() => { setSentTo(null); setMsg(null); setErr(null); }}>
          Use a different email
        </button>

        {msg && <div className="authmsg ok" role="status">{msg}</div>}
        {err && <div className="authmsg err" role="alert">{err}</div>}

        <div className="authfoot">
          <span>
            Already confirmed?<Link href="/login">Log in</Link>
          </span>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <BrandMark size={32} />SOCIA
      </div>

      <h1>Create your account</h1>
      <p className="auth-sub">Start planning smarter content in minutes.</p>

      <button className="gbtn" onClick={signUpWithGoogle} type="button">
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="divider">
        <span>or sign up with email</span>
      </div>

      <form onSubmit={signUp}>
        <label htmlFor="signup-email">Email</label>
        <div className="field">
          <Mail size={18} className="field-ico" aria-hidden />
          <input
            id="signup-email"
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label htmlFor="signup-password">Password</label>
        <div className="field">
          <Lock size={18} className="field-ico" aria-hidden />
          <input
            id="signup-password"
            autoComplete="new-password"
            type={showPw ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            className="field-eye"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Creating account…" : <>Create account <ArrowRight size={18} aria-hidden /></>}
        </button>
      </form>

      {msg && <div className="authmsg ok">{msg}</div>}
      {err && <div className="authmsg err">{err}</div>}

      <div className="authfoot">
        <span>
          Already have an account?<Link href="/login">Log in</Link>
        </span>
        <span className="tos">
          By signing up you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </span>
      </div>
    </AuthShell>
  );
}
