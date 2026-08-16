"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        <span className="brand-mark">S</span>SOCIA
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
        <label>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <label>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <button className="linkbtn" onClick={sendMagicLink} type="button">
        Email me a magic link instead
      </button>

      {msg && <div className="authmsg ok">{msg}</div>}
      {err && <div className="authmsg err">{err}</div>}

      <div className="authfoot">
        <Link href="/forgot-password">Forgot password?</Link>
        <span>
          No account? <Link href="/signup">Sign up</Link>
        </span>
      </div>
    </AuthShell>
  );
}
