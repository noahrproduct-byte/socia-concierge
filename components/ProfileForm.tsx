"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Tag, AtSign, Target, Check } from "lucide-react";

import { NICHES } from "@/lib/niches";

export { NICHES };

export default function ProfileForm({
  mode,
  email,
}: {
  mode: "onboarding" | "settings";
  /** Settings only: shown read-only in the form grid. */
  email?: string;
}) {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [brand, setBrand] = useState("");
  const [goals, setGoals] = useState("");
  const [initial, setInitial] = useState({ niche: "", brand: "", goals: "" });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Prefill from the existing profile.
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((j) => {
        const p = j.profile;
        if (p) {
          setNiche(p.niche ?? "");
          setBrand(p.brand_name ?? "");
          setGoals(p.goals ?? "");
          setInitial({ niche: p.niche ?? "", brand: p.brand_name ?? "", goals: p.goals ?? "" });
        }
      })
      .catch(() => {});
  }, []);

  // The saved checkmark reverts on its own.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const dirty = niche !== initial.niche || brand !== initial.brand || goals !== initial.goals;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, brand_name: brand, goals }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save.");
      if (mode === "onboarding") {
        router.push("/dashboard");
        router.refresh();
      } else {
        setInitial({ niche, brand, goals });
        setSaved(true);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "onboarding") {
    return (
      <form onSubmit={save}>
        <label>What&apos;s your niche?</label>
        <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
          <option value="" disabled>Choose a category…</option>
          {NICHES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <label>Account or brand name <span className="opt">— optional</span></label>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="@yourhandle or your business name" />

        <label>Your main goal <span className="opt">— helps the AI</span></label>
        <input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. grow followers, drive bookings, sell a course" />

        <button className="authbtn" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Continue"}
        </button>

        {saved && <div className="authmsg ok">Saved ✓</div>}
        {err && <div className="authmsg err">{err}</div>}
      </form>
    );
  }

  return (
    <form onSubmit={save} className="st2-form">
      <div className="st2-grid">
        <div className="st2-field">
          <label>
            <Mail size={12} /> Email
          </label>
          <input type="email" value={email ?? ""} readOnly />
        </div>
        <div className="st2-field">
          <label>
            <Tag size={12} /> What&apos;s your niche?
          </label>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
            <option value="" disabled>Choose a category…</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="st2-field">
          <label>
            <AtSign size={12} /> Account or brand name <em>— optional</em>
          </label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="@yourhandle or your business name"
          />
        </div>
        <div className="st2-field">
          <label>
            <Target size={12} /> Your main goal <em>— helps the AI</em>
          </label>
          <input
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. grow followers, drive bookings, sell a course"
          />
        </div>
      </div>

      <div className="st2-form-foot">
        <button className={`st2-save${saved ? " ok" : ""}`} type="submit" disabled={loading}>
          {loading ? (
            "Saving…"
          ) : saved ? (
            <>
              <Check size={15} /> Saved
            </>
          ) : dirty ? (
            "Save changes"
          ) : (
            "Save profile"
          )}
        </button>
        {err && <span className="st2-err">{err}</span>}
      </div>
    </form>
  );
}
