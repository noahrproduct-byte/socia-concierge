"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // null while checking; false means the reset link never became a session
  // (expired, already used, or opened without going through /auth/callback).
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setHasSession(Boolean(data.user));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the confirmation sit on screen for a beat before moving on.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [done, router]);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <BrandMark size={32} />SOCIA
      </div>

      <h1>Set a new password</h1>
      <p className="auth-sub">Choose a new password for your account.</p>

      {hasSession === false ? (
        <>
          <div className="authmsg err" role="alert">
            This reset link is invalid or has expired.
          </div>
          <div className="authfoot">
            <span>
              <Link href="/forgot-password">Request a new reset link</Link>
            </span>
            <span>
              <Link href="/login">Back to log in</Link>
            </span>
          </div>
        </>
      ) : done ? (
        <div className="authmsg ok" role="status">
          Password updated. Taking you to your dashboard.
        </div>
      ) : (
        <>
          <form onSubmit={updatePassword}>
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
            <button className="authbtn" type="submit" disabled={loading || hasSession === null}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>

          {err && <div className="authmsg err" role="alert">{err}</div>}
        </>
      )}
    </AuthShell>
  );
}
