"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";

// Plain sentences for the short codes /auth/callback sends back on failure.
// Anything unrecognised gets the generic line, never a raw provider string.
const CALLBACK_ERRORS: Record<string, string> = {
  otp_expired: "That sign-in link has expired. Request a new one below.",
  access_denied: "Sign-in was cancelled.",
  exchange_failed: "We couldn't complete sign-in. Try again.",
  no_code: "We couldn't complete sign-in. Try again.",
};

// Only same-site paths are honored as a return-to target. Absolute URLs and
// protocol-relative "//host" values fall back to the dashboard.
function safeNext(raw: string | null): string | null {
  return raw && /^\/(?![\/\\])/.test(raw) ? raw : null;
}

export default function LoginPage() {
  // useSearchParams has to sit under a Suspense boundary so the page can
  // still be prerendered; the shell and heading render immediately.
  return (
    <AuthShell>
      <Suspense fallback={<LoginHeader />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

function LoginHeader() {
  return (
    <>
      <div className="auth-mobilelogo">
        <BrandMark size={32} />SOCIA
      </div>

      <h1>Welcome back</h1>
      <p className="auth-sub">Log in to your SOCIA account.</p>
    </>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const next = safeNext(params.get("next"));
  const callbackError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(() =>
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? CALLBACK_ERRORS.exchange_failed) : null,
  );

  // Where a successful login lands: the page they were sent here from, or
  // the dashboard. Callback-based logins get the same target via `next`.
  const destination = next ?? "/dashboard";
  function callbackUrl() {
    const base = `${window.location.origin}/auth/callback`;
    return next ? `${base}?next=${encodeURIComponent(next)}` : base;
  }

  // Already signed in? Straight to the app instead of showing a login form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(destination);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function loginWithGoogle() {
    setErr(null);
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setMsg(`Magic link sent to ${email}. Check your inbox.`);
  }

  return (
    <>
      <LoginHeader />

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
          <Mail size={16} className="field-ico" />
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label htmlFor="login-password">Password</label>
        <div className="field">
          <Lock size={16} className="field-ico" />
          <input
            id="login-password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            className="field-eye"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
            aria-pressed={showPw}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Sessions always persist, so a "Remember me" box here would be a
            control that changes nothing. Only the recovery link stays. */}
        <div className="auth-row auth-row-end">
          <Link href="/forgot-password" className="auth-mini">Forgot password?</Link>
        </div>

        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Logging in…" : <>Log in <ArrowRight size={15} /></>}
        </button>
      </form>

      <button className="linkbtn" onClick={sendMagicLink} type="button" disabled={loading}>
        Email me a magic link instead
      </button>

      {msg && <div className="authmsg ok" role="status">{msg}</div>}
      {err && <div className="authmsg err" role="alert">{err}</div>}

      <div className="authfoot">
        <span>
          No account? <Link href="/signup">Sign up</Link>
        </span>
      </div>
    </>
  );
}
