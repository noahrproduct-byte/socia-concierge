"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import AuthShell, { GoogleIcon } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Already signed in? Straight to the app instead of a signup form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      router.push("/onboarding");
      router.refresh();
    } else {
      setMsg(
        `Almost there. We sent a confirmation link to ${email}. Click it to finish signing up.`,
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
        <label>Email</label>
        <div className="field">
          <Mail size={16} className="field-ico" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label>Password</label>
        <div className="field">
          <Lock size={16} className="field-ico" />
          <input
            type={showPw ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
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
          {loading ? "Creating account…" : <>Create account <ArrowRight size={15} /></>}
        </button>
      </form>

      {msg && <div className="authmsg ok">{msg}</div>}
      {err && <div className="authmsg err">{err}</div>}

      <div className="authfoot">
        <span>
          Already have an account? <Link href="/login">Log in</Link>
        </span>
        <span className="tos">
          By signing up you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </span>
      </div>
    </AuthShell>
  );
}
