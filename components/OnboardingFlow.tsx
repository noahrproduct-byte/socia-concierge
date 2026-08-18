"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { NICHES } from "./ProfileForm";
import ConnectAccounts from "./ConnectAccounts";

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [niche, setNiche] = useState("");
  const [brand, setBrand] = useState("");
  const [goals, setGoals] = useState("");
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setConnected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function finish() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          brand_name: brand,
          goals,
          platforms: connected,
          account_connected: connected.length > 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save.");
      router.push("/dashboard");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
      setLoading(false);
    }
  }

  return (
    <div className="onb-flow">
      <div className="onb-steps">
        <span className={`onb-step${step >= 1 ? " on" : ""}`}>
          <b>1</b> About you
        </span>
        <span className="onb-step-line" />
        <span className={`onb-step${step >= 2 ? " on" : ""}`}>
          <b>2</b> Connect accounts
        </span>
      </div>

      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (niche) setStep(2);
          }}
        >
          <label>What&apos;s your niche?</label>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
            <option value="" disabled>Choose a category…</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <label>Account or brand name <span className="opt">— optional</span></label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="@yourhandle or your business name"
          />

          <label>Your main goal <span className="opt">— helps the AI</span></label>
          <input
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. grow followers, drive bookings, sell a course"
          />

          <button className="authbtn" type="submit" disabled={!niche}>
            Continue <ArrowRight size={16} />
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <p className="onb-connect-sub">
            Link the accounts you post to so SOCIA can pull your numbers and tailor every
            plan. You can add more later in Settings.
          </p>

          <ConnectAccounts connected={connected} onToggle={toggle} />

          <p className="onb-connect-note">
            Connecting registers the account now so your dashboard reflects it — live data
            sync switches on as each platform approves our API access.
          </p>

          {err && <div className="authmsg err">{err}</div>}

          <div className="onb-actions">
            <button className="onb-back" type="button" onClick={() => setStep(1)} disabled={loading}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="authbtn onb-finish" type="button" onClick={finish} disabled={loading}>
              {loading ? "Setting up…" : connected.length ? "Finish setup" : "Finish — connect later"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
