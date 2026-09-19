"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setMsg(`If an account exists for ${email}, a reset link is on its way.`);
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <BrandMark size={32} />SOCIA
      </div>

      <h1>Reset your password</h1>
      <p className="auth-sub">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={sendReset}>
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      {msg && <div className="authmsg ok" role="status">{msg}</div>}
      {err && <div className="authmsg err" role="alert">{err}</div>}

      <div className="authfoot">
        <Link href="/login">← Back to log in</Link>
      </div>
    </AuthShell>
  );
}
