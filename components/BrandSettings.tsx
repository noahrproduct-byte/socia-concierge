"use client";

// Profile & Brand settings. Everything saved here is injected into the AI
// prompts (content plans, strategist chat, niche intelligence).

import { useEffect, useState } from "react";
import { Mail, Tag, AtSign, Target, Check, Globe, MapPin, Ban } from "lucide-react";
import { NICHES } from "@/lib/niches";
import type { BrandDetail } from "@/lib/profile";

const VOICES = ["Professional", "Casual", "Bold", "Funny", "Educational"];

export default function BrandSettings({ email }: { email?: string }) {
  const [niche, setNiche] = useState("");
  const [brand, setBrand] = useState("");
  const [goals, setGoals] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [voice, setVoice] = useState("");
  const [avoid, setAvoid] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const state = JSON.stringify([niche, brand, goals, website, location, description, voice, avoid]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((j) => {
        const p = j.profile;
        if (!p) return;
        const d = (p.brand_detail ?? {}) as BrandDetail;
        setNiche(p.niche ?? "");
        setBrand(p.brand_name ?? "");
        setGoals(p.goals ?? "");
        setWebsite(d.website ?? "");
        setLocation(d.location ?? "");
        setDescription(d.description ?? "");
        setVoice(d.voice ?? "");
        setAvoid(d.avoid ?? "");
        setSnapshot(
          JSON.stringify([
            p.niche ?? "",
            p.brand_name ?? "",
            p.goals ?? "",
            d.website ?? "",
            d.location ?? "",
            d.description ?? "",
            d.voice ?? "",
            d.avoid ?? "",
          ])
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const dirty = snapshot !== "" && state !== snapshot;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          brand_name: brand,
          goals,
          brand_detail: { website, location, description, voice, avoid },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save.");
      setNeedsMigration(json.brandSaved === false);
      setSnapshot(state);
      setSaved(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={save} className="st2-form">
      <div className="st2-grid">
        <div className="st2-field">
          <label><Mail size={12} /> Email</label>
          <input type="email" value={email ?? ""} readOnly />
        </div>
        <div className="st2-field">
          <label><Tag size={12} /> Industry / niche</label>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
            <option value="" disabled>Choose a category…</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="st2-field">
          <label><AtSign size={12} /> Business / brand name</label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="@yourhandle or your business name"
          />
        </div>
        <div className="st2-field">
          <label><Target size={12} /> Primary goal <em>— steers every recommendation</em></label>
          <input
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. grow followers, drive bookings, sell a course"
          />
        </div>
        <div className="st2-field">
          <label><Globe size={12} /> Website <em>— optional</em></label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourbusiness.com"
            type="url"
          />
        </div>
        <div className="st2-field">
          <label><MapPin size={12} /> Location / market <em>— sharpens local angles</em></label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Hermitage, TN"
          />
        </div>
      </div>

      <div className="st2-field st3-wide">
        <label>Brand description <em>— one or two sentences</em></label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What you make, who it's for, what makes it different."
        />
      </div>

      <div className="st2-field st3-wide">
        <label>Brand voice <em>— the AI writes hooks in this tone</em></label>
        <div className="st3-pills" role="radiogroup" aria-label="Brand voice">
          {VOICES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={voice === v}
              className={`st3-pill${voice === v ? " on" : ""}`}
              onClick={() => setVoice(voice === v ? "" : v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="st2-field st3-wide">
        <label><Ban size={12} /> Words / topics to avoid <em>— hard rule for the AI</em></label>
        <input
          value={avoid}
          onChange={(e) => setAvoid(e.target.value)}
          placeholder="e.g. slang, discounts talk, competitor names"
        />
      </div>

      <div className="st2-form-foot">
        <button className={`st2-save${saved ? " ok" : ""}`} type="submit" disabled={loading}>
          {loading ? "Saving…" : saved ? <><Check size={15} /> Saved</> : dirty ? "Save changes" : "Save brand profile"}
        </button>
        {err && <span className="st2-err">{err}</span>}
        {needsMigration && (
          <span className="st2-err">
            Brand fields need the latest database migration (supabase/schema.sql) to persist.
          </span>
        )}
      </div>
    </form>
  );
}
