"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";
import { safeNext } from "@/lib/safeNext";
import { applyRemember } from "@/lib/rememberMe";
import { RESEND_WAIT, isUnconfirmed, linkProblem, sendProblem } from "@/lib/authEmail";

/** Where to go after signing in: ?next= when it is a path on this site (e.g. an AI app's consent screen). */
const nextPath = () => safeNext(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next"));
const callbackUrl = () => {
  const next = nextPath();
  return `${window.location.origin}/auth/callback${next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`}`;
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The address a log-in was refused for because it isn't confirmed yet: offers the link again.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  // Back from an email link that didn't work (/auth/confirm, /auth/callback): say so.
  useEffect(() => {
    const problem = linkProblem(new URLSearchParams(window.location.search).get("error"));
    if (problem) setErr(problem);
  }, []);

  // Already signed in? Straight to the app instead of showing a login form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(nextPath());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    applyRemember(remember);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      if (isUnconfirmed(error)) {
        setUnconfirmed(email);
        setErr("Confirm your email first. We sent a link to this address when you signed up.");
      } else {
        setUnconfirmed(null);
        setErr(error.message);
      }
      return;
    }
    router.push(nextPath());
    router.refresh();
  }

  async function resendConfirmation() {
    if (!unconfirmed || wait > 0) return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmed, options: { emailRedirectTo: callbackUrl() } });
    setLoading(false);
    if (error) {
      setErr(sendProblem(error) ?? "We couldn't send the link just now. Try again in a minute.");
      return;
    }
    setErr(null);
    setMsg(`Confirmation link sent to ${unconfirmed}. Open it, then log in.`);
    setWait(RESEND_WAIT);
  }

  async function loginWithGoogle() {
    setErr(null);
    applyRemember(remember);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setErr(error.message);
  }

  async function sendMagicLink() {
    if (!email) {
      setErr("Enter your email first, then tap the magic link button.");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    applyRemember(remember);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) setErr(sendProblem(error) ?? error.message);
    else setMsg(`Magic link sent to ${email}. Check your inbox.`);
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <BrandMark size={32} />SOCIA
      </div>

      <h1>Welcome back</h1>
      <p className="auth-sub">Log in to your SOCIA account.</p>

      <button className="gbtn" onClick={loginWithGoogle} type="button">
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="divider">
        <span>or continue with email</span>
      </div>

      <form onSubmit={loginWithPassword}>
        <label htmlFor="login-email">Email</label>
        <div className="field">
          <Mail size={18} className="field-ico" aria-hidden />
          <input
            id="login-email"
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label htmlFor="login-password">Password</label>
        <div className="field">
          <Lock size={18} className="field-ico" aria-hidden />
          <input
            id="login-password"
            autoComplete="current-password"
            type={showPw ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
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

        <div className="auth-row">
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
          </label>
          <Link href="/forgot-password" className="auth-mini">Forgot password?</Link>
        </div>

        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Logging in…" : <>Log in <ArrowRight size={18} aria-hidden /></>}
        </button>
      </form>

      <button className="linkbtn" onClick={sendMagicLink} type="button">
        Email me a magic link instead
      </button>

      {msg && <div className="authmsg ok" role="status">{msg}</div>}
      {err && <div className="authmsg err" role="alert">{err}</div>}
      {unconfirmed && (
        <button className="linkbtn" type="button" onClick={resendConfirmation} disabled={loading || wait > 0}>
          {wait > 0 ? `Send the confirmation link again in ${wait}s` : "Send the confirmation link again"}
        </button>
      )}

      <div className="authfoot">
        <span>
          No account?<Link href="/signup">Sign up</Link>
        </span>
      </div>
    </AuthShell>
  );
}
