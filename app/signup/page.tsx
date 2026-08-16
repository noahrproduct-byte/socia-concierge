"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
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
      setErr(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setMsg(
        `Almost there — we sent a confirmation link to ${email}. Click it to finish signing up.`,
      );
    }
  }

  async function signUpWithGoogle() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <span className="brand-mark">S</span>SOCIA
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
          placeholder="At least 6 characters"
        />
        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      {msg && <div className="authmsg ok">{msg}</div>}
      {err && <div className="authmsg err">{err}</div>}

      <div className="authfoot">
        <span>
          Already have an account? <Link href="/login">Log in</Link>
        </span>
        <span className="tos">
          By signing up you agree to our Terms &amp; Privacy Policy.
        </span>
      </div>
    </AuthShell>
  );
}
