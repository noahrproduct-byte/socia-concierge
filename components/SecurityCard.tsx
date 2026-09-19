"use client";

// Security & privacy: real Supabase auth operations only.

import { useState } from "react";
import { Check, Download, KeyRound, Loader2, MonitorOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SecurityCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"pw" | "signout" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy("pw");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      setPw("");
      setPw2("");
      setMsg("Password updated.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't update the password.");
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    setBusy("signout");
    setErr(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "global" });
      window.location.href = "/login";
    } catch {
      setErr("Couldn't sign out everywhere, try again.");
      setBusy(null);
    }
  }

  return (
    <div className="st3-security">
      <form onSubmit={changePassword} className="st3-pwform">
        <small className="st3-sub">
          <KeyRound size={12} /> Change password
        </small>
        <div className="st3-pwrow">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            aria-label="New password"
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            aria-label="Confirm new password"
          />
          <button className="st2-btn" type="submit" disabled={busy === "pw" || !pw}>
            {busy === "pw" ? <Loader2 size={14} className="spin" /> : "Update"}
          </button>
        </div>
        {msg && (
          <p className="st3-ok">
            <Check size={12} /> {msg}
          </p>
        )}
        {err && <p className="st2-err">{err}</p>}
      </form>

      <div className="st3-sec-actions">
        <a className="st2-btn" href="/api/export">
          <Download size={14} /> Export my data
        </a>
        <button
          className="st2-btn danger"
          type="button"
          onClick={signOutEverywhere}
          disabled={busy === "signout"}
        >
          {busy === "signout" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <>
              <MonitorOff size={14} /> Log out all devices
            </>
          )}
        </button>
      </div>
      <p className="st3-note">
        Export downloads your profile, plans, and conversations as JSON. Access tokens are never
        included.
      </p>
    </div>
  );
}
