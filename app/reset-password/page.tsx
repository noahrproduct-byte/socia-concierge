"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="auth-mobilelogo">
        <span className="brand-mark">S</span>SOCIA
      </div>

      <h1>Set a new password</h1>
      <p className="auth-sub">Choose a new password for your account.</p>

      <form onSubmit={updatePassword}>
        <label>New password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>

      {err && <div className="authmsg err">{err}</div>}
    </AuthShell>
  );
}
