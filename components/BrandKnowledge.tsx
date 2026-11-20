"use client";

// "What you offer" (lib/brandKnowledge.ts): the brand's features, products, menu or services and the facts
// it states, read from its website and/or typed by the person. Every script, caption, plan and reply uses
// this list and nothing outside it. In setup (components/OnboardingFlow.tsx) and Settings. Edits save on
// their own a moment after typing stops.
import { useEffect, useRef, useState } from "react";
import { Globe, Plus, X } from "lucide-react";
import { Button, Field, IconButton, Input, Textarea } from "@/components/system";
import { MAX_FACTS, MAX_OFFERINGS, type BrandKnowledge as Knowledge, type Offering } from "@/lib/brandKnowledge";
import "./brandKnowledge.css";

type Saved = "idle" | "saving" | "saved" | "error";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function BrandKnowledge({ intro }: { intro?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [website, setWebsite] = useState("");
  const [summary, setSummary] = useState("");
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [facts, setFacts] = useState("");
  const [source, setSource] = useState<Knowledge["source"]>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>("idle");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fill = (k: Knowledge | null) => {
    setSummary(k?.summary ?? "");
    setOfferings(k?.offerings ?? []);
    setFacts((k?.facts ?? []).join("\n"));
    setSource(k?.source ?? null);
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/brand/knowledge").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      fill((j?.knowledge as Knowledge | null) ?? null);
      setWebsite((j?.website as string | null) ?? "");
      setCanEdit(Boolean(j?.canEdit));
      setLoaded(true);
    }).catch(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  // Save a moment after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      dirty.current = false;
      setSaved("saving");
      const knowledge = {
        summary,
        offerings: offerings.filter((o) => o.name.trim()),
        facts: facts.split("\n").map((f) => f.trim()).filter(Boolean),
      };
      const res = await fetch("/api/brand/knowledge", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledge }) }).catch(() => null);
      setSaved(res?.ok ? "saved" : "error");
    }, 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [summary, offerings, facts]);

  const change = <T,>(set: (v: T) => void) => (v: T) => { dirty.current = true; setSaved("idle"); set(v); };
  const setSummaryEdit = change(setSummary);
  const setFactsEdit = change(setFacts);
  const setOfferingsEdit = change(setOfferings);

  const read = async () => {
    setReading(true);
    setError(null);
    const res = await fetch("/api/brand/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setReading(false);
    if (!res?.ok || !j?.knowledge) { setError((j?.error as string) ?? "SOCIA couldn't read the website. Try again."); return; }
    dirty.current = false;
    fill(j.knowledge as Knowledge);
    if (typeof j.website === "string") setWebsite(j.website);
    setSaved("saved");
  };

  if (!loaded) return null;

  if (!canEdit) {
    return (
      <div className="bk">
        {!offerings.length && !summary && <p className="bk-lead">Nothing listed yet. The brand owner or an admin can add what the brand offers.</p>}
        {summary && <p className="bk-lead">{summary}</p>}
        {offerings.length > 0 && <ul className="bk-list">{offerings.map((o) => <li key={o.name}><b>{o.name}</b>{o.detail && <span>{o.detail}</span>}</li>)}</ul>}
      </div>
    );
  }

  return (
    <div className="bk">
      <p className="bk-lead">
        {intro ?? "List everything you offer: your app's features, your menu, your products or your services. Every script, caption, plan and comment reply uses this list, and never names anything that isn't on it."}
      </p>

      <div className="bk-site">
        <Field label="Your website" optional hint="SOCIA reads the homepage and up to five pages about what you offer, then fills in the list below for you to check.">
          <Input type="url" inputMode="url" maxLength={300} value={website} placeholder="e.g. sociaos.com" onChange={(e) => setWebsite(e.target.value)} />
        </Field>
        <Button size="sm" variant="secondary" busy={reading} disabled={reading || !website.trim()} onClick={read}>
          <Globe size={14} aria-hidden /> {reading ? "Reading your website" : source ? "Read it again" : "Read my website"}
        </Button>
      </div>
      {source && <p className="bk-meta">Read from {source.pages.length} page{source.pages.length === 1 ? "" : "s"} of {hostOf(source.url)} on {day(source.at)}. Change anything that&apos;s wrong.</p>}
      {error && <p className="bk-err" role="alert">{error}</p>}

      <Field label="What it is" optional>
        <Textarea rows={2} maxLength={600} value={summary} placeholder="e.g. An AI app that plans, edits and posts Instagram Reels for small businesses and creators." onChange={(e) => setSummaryEdit(e.target.value)} />
      </Field>

      <div className="bk-offers">
        <span className="s-label">What you offer</span>
        {offerings.length === 0 && <p className="bk-meta">Nothing yet. Read your website above, or add each feature, product, dish or service.</p>}
        <ul className="bk-rows">
          {offerings.map((o, i) => (
            <li key={i}>
              <Input aria-label={`Name ${i + 1}`} maxLength={80} value={o.name} placeholder="Name, e.g. Video editor" onChange={(e) => setOfferingsEdit(offerings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`What it is ${i + 1}`} maxLength={160} value={o.detail ?? ""} placeholder="What it does, in a line" onChange={(e) => setOfferingsEdit(offerings.map((x, j) => (j === i ? { ...x, detail: e.target.value || null } : x)))} />
              <IconButton label={`Remove ${o.name || "this one"}`} size="sm" onClick={() => setOfferingsEdit(offerings.filter((_, j) => j !== i))}><X size={14} /></IconButton>
            </li>
          ))}
        </ul>
        {offerings.length < MAX_OFFERINGS && (
          <Button size="sm" variant="ghost" onClick={() => setOfferingsEdit([...offerings, { name: "", detail: null }])}>
            <Plus size={14} aria-hidden /> Add one
          </Button>
        )}
      </div>

      <Field label="Facts" optional hint={`Hours, prices, locations, how to order or sign up. One per line, up to ${MAX_FACTS}.`}>
        <Textarea rows={3} value={facts} placeholder={"e.g. Open Tuesday to Sunday, 11am to 9pm\nFree plan, paid plans from $29.99 a month"} onChange={(e) => setFactsEdit(e.target.value)} />
      </Field>

      <p className="bk-meta" aria-live="polite">{saved === "saving" ? "Saving" : saved === "saved" ? "Saved" : saved === "error" ? "Couldn't save. Change something to try again." : ""}</p>
    </div>
  );
}
