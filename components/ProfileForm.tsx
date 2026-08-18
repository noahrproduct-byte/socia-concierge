"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const NICHES = [
  "Food & Restaurant",
  "Fitness & Health",
  "Beauty & Skincare",
  "Fashion & Style",
  "Travel",
  "Tech & Gadgets",
  "Education & How-to",
  "Gaming",
  "Business & Finance",
  "Lifestyle & Vlogs",
  "Home & Decor",
  "Real Estate",
  "Music & Entertainment",
  "Parenting & Family",
  "Art & Design",
  "Pets & Animals",
  "Automotive",
  "Other",
];

export default function ProfileForm({ mode }: { mode: "onboarding" | "settings" }) {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [brand, setBrand] = useState("");
  const [goals, setGoals] = useState("");
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
        }
      })
      .catch(() => {});
  }, []);

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
        setSaved(true);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setLoading(false);
    }
  }

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

      <button className="authbtn" type="submit" disabled={loading} style={{ maxWidth: mode === "settings" ? 180 : "none" }}>
        {loading ? "Saving…" : mode === "onboarding" ? "Continue" : "Save profile"}
      </button>

      {saved && <div className="authmsg ok">Saved ✓</div>}
      {err && <div className="authmsg err">{err}</div>}
    </form>
  );
}
