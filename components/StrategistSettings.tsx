"use client";

// AI Strategist preferences. Saved into brand_detail.strategist and injected
// into the strategist chat and content-plan prompts — these genuinely change
// what the AI recommends.

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { BrandDetail } from "@/lib/profile";

const LEVELS = [
  { id: "safe", label: "Safe", desc: "Proven plays only" },
  { id: "balanced", label: "Balanced", desc: "Mostly proven, light experiments" },
  { id: "experimental", label: "Experimental", desc: "Bolder, higher-variance ideas" },
] as const;

const FORMATS = ["Reels", "Carousels", "Stories", "Static posts", "Lives"];
const FREQUENCIES = ["1 to 2 posts a week", "3 posts a week", "4 to 5 posts a week", "Daily"];

// Earlier builds stored "1–2 posts / week"; map those onto the current options.
function normalizeFrequency(f: string | undefined): string {
  if (!f) return "";
  const legacy = f.replace(/[–-]/, " to ").replace(" / week", " a week");
  return FREQUENCIES.includes(legacy) ? legacy : f;
}

export default function StrategistSettings() {
  const [aggr, setAggr] = useState<string>("");
  const [formats, setFormats] = useState<string[]>([]);
  const [frequency, setFrequency] = useState("");
  const [prioritize, setPrioritize] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const state = JSON.stringify([aggr, [...formats].sort(), frequency, prioritize]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((j) => {
        const s = ((j.profile?.brand_detail ?? {}) as BrandDetail).strategist ?? {};
        const freq = normalizeFrequency(s.frequency);
        setAggr(s.aggressiveness ?? "");
        setFormats(s.formats ?? []);
        setFrequency(freq);
        setPrioritize(s.prioritize ?? "");
        setSnapshot(
          JSON.stringify([
            s.aggressiveness ?? "",
            [...(s.formats ?? [])].sort(),
            freq,
            s.prioritize ?? "",
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

  function toggleFormat(f: string) {
    setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_detail: {
            strategist: {
              aggressiveness: (aggr || undefined) as
                | "safe"
                | "balanced"
                | "experimental"
                | undefined,
              formats,
              frequency,
              prioritize,
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save.");
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
      <div className="st2-field st3-wide">
        <label id="ss-aggr-label">How aggressive should recommendations be?</label>
        <div className="st3-levels" role="radiogroup" aria-labelledby="ss-aggr-label">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={aggr === l.id}
              className={`st3-level${aggr === l.id ? " on" : ""}`}
              onClick={() => setAggr(aggr === l.id ? "" : l.id)}
            >
              <b>{l.label}</b>
              <small>{l.desc}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="st2-grid">
        <div className="st2-field">
          <label id="ss-formats-label">Preferred content formats</label>
          <div className="st3-pills" role="group" aria-labelledby="ss-formats-label">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={formats.includes(f)}
                className={`st3-pill${formats.includes(f) ? " on" : ""}`}
                onClick={() => toggleFormat(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="st2-field">
          <label htmlFor="ss-frequency">Content frequency target</label>
          <select id="ss-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="">No target</option>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="st2-field st3-wide">
        <label htmlFor="ss-prioritize">Topics to prioritize <em>optional</em></label>
        <input
          id="ss-prioritize"
          value={prioritize}
          onChange={(e) => setPrioritize(e.target.value)}
          placeholder="e.g. behind-the-scenes, catering, weekly specials"
        />
      </div>

      <p className="st3-note">
        These preferences are written into every content plan and strategist conversation.
        Words/topics to avoid live in Profile &amp; Brand.
      </p>

      <div className="st2-form-foot">
        <button className={`st2-save${saved ? " ok" : ""}`} type="submit" disabled={loading}>
          {loading ? "Saving…" : saved ? <><Check size={15} /> Saved</> : dirty ? "Save changes" : "Save preferences"}
        </button>
        {err && <span className="st2-err">{err}</span>}
      </div>
    </form>
  );
}
