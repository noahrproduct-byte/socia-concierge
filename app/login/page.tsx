"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Already signed in? Straight to the app instead of showing a login form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard");
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
    router.push("/dashboard");
    router.refresh();
  }

  async function loginWithGoogle() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setErr(error.message);
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
          <Mail size={16} className="field-ico" />
          <input
            id="login-email"
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
    </AuthShell>
  );
}
