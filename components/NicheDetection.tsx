"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Sparkles, RefreshCw, ChevronRight, Loader2 } from "lucide-react";
import BrandMark from "./BrandMark";
import { NICHES } from "@/lib/niches";
import type { Extracted } from "@/app/api/analyze-account/route";

// Niche detection for /niche. SOCIA asks only when it cannot know:
// - detect mode auto-analyzes the connected account's real content
// - high confidence → confirmation card → trends
// - low confidence → likely directions to pick from
// - insufficient content → "tell SOCIA what you're building"
// - settled mode renders the niche chip with Change / Rescan

type State =
  | { s: "analyzing" }
  | { s: "detected"; x: Extracted }
  | { s: "low"; x: Extracted }
  | { s: "insufficient"; posts: number }
  | { s: "manual"; note?: string }
  | { s: "describing" }
  | { s: "saving" };

export type NicheDetail = {
  sub_niche?: string | null;
  content_style?: string | null;
  audience?: string | null;
  confidence?: number | null;
  signals?: string[] | null;
  source?: string | null;
} | null;

const STEP_MS = 750;

export default function NicheDetection({
  mode,
  niche,
  detail,
  username,
  mediaCount,
}: {
  /** detect: auto-analyze now · settled: show chip · manual: describe/choose only */
  mode: "detect" | "settled" | "manual";
  niche?: string | null;
  detail?: NicheDetail;
  username?: string | null;
  mediaCount?: number | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"chip" | "detect" | "choose">(
    mode === "settled" ? "chip" : "detect",
  );
  const [state, setState] = useState<State>(
    mode === "manual" ? { s: "insufficient", posts: 0 } : { s: "analyzing" },
  );
  const [step, setStep] = useState(0);
  const [describeText, setDescribeText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const steps = [
    username ? `Profile @${username}` : "Profile",
    mediaCount ? `${mediaCount} recent posts` : "Recent content",
    "Captions & topics",
    "Formats & patterns",
  ];

  const analyze = useCallback(async () => {
    setView("detect");
    setState({ s: "analyzing" });
    setStep(0);
    setErr(null);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = reduced
      ? null
      : setInterval(() => setStep((v) => Math.min(v + 1, steps.length - 1)), STEP_MS);

    try {
      const res = await fetch("/api/analyze-account");
      const json = await res.json();
      if (tick) clearInterval(tick);
      setStep(steps.length);

      if (!json.connected) {
        setState({ s: "manual", note: "We couldn't reach your Instagram. Pick your niche manually, or reconnect in Settings." });
        return;
      }
      if (json.insufficient) {
        setState({ s: "insufficient", posts: json.posts ?? 0 });
        return;
      }
      const x = json.extracted as Extracted | null;
      if (!x) {
        setState({ s: "manual", note: "Automatic analysis isn't available right now. Pick your niche manually." });
        return;
      }
      if (x.confidence >= 75) setState({ s: "detected", x });
      else setState({ s: "low", x });
    } catch {
      if (tick) clearInterval(tick);
      setState({ s: "manual", note: "Analysis failed. Pick your niche manually, or try a rescan in a minute." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === "detect" && !started.current) {
      started.current = true;
      analyze();
    }
  }, [mode, analyze]);

  async function choose(n: string) {
    setState({ s: "saving" });
    setErr(null);
    try {
      const res = await fetch("/api/analyze-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choose: { niche: n } }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setErr("Couldn't save that. Try again.");
      setState({ s: "manual" });
    }
  }

  async function describe() {
    if (!describeText.trim()) {
      setErr("Tell SOCIA what you'll post about first.");
      return;
    }
    setState({ s: "describing" });
    setErr(null);
    try {
      const res = await fetch("/api/analyze-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ describe: describeText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Couldn't structure that. Try again.");
      setState({ s: "insufficient", posts: 0 });
    }
  }

  // ---------- settled: the niche chip ----------
  if (view === "chip") {
    return (
      <div className="nd-chip-row">
        <div className="nd-chip">
          <small>Niche</small>
          <b>
            {niche}
            {detail?.sub_niche ? <span> · {detail.sub_niche}</span> : null}
          </b>
        </div>
        <button className="nd-mini" onClick={() => setView("choose")} type="button">
          Change
        </button>
        <button className="nd-mini" onClick={analyze} type="button" title="Re-analyze your account content">
          <RefreshCw size={12} /> Rescan niche
        </button>
        {detail?.confidence != null && detail?.source === "auto" && (
          <span className="nd-conf" title="How confident the AI was when it read your account">
            detected from your content · {detail.confidence}%
          </span>
        )}
      </div>
    );
  }

  // ---------- manual chooser ----------
  if (view === "choose" || state.s === "manual") {
    const note = state.s === "manual" ? state.note : null;
    return (
      <div className="nd-card">
        <h2 className="nd-title">Choose your niche</h2>
        {note && <p className="nd-sub">{note}</p>}
        <div className="nd-grid">
          {NICHES.map((n) => (
            <button key={n} className="nd-opt" onClick={() => choose(n)} type="button" disabled={state.s === "saving"}>
              {n}
            </button>
          ))}
        </div>
        {err && <p className="nd-err">{err}</p>}
        {mode === "settled" && (
          <button className="nd-mini mt" onClick={() => setView("chip")} type="button">
            Cancel
          </button>
        )}
      </div>
    );
  }

  // ---------- analyzing ----------
  if (state.s === "analyzing" || state.s === "saving" || state.s === "describing") {
    const label =
      state.s === "analyzing"
        ? "Understanding your content…"
        : state.s === "describing"
          ? "Structuring your niche…"
          : "Saving…";
    return (
      <div className="nd-card center">
        <span className="nd-orb"><BrandMark size={34} /></span>
        <h2 className="nd-title">{label}</h2>
        {state.s === "analyzing" && (
          <>
            <p className="nd-sub">SOCIA is analyzing your recent posts to identify your niche.</p>
            <ul className="nd-steps">
              {steps.map((st, i) => (
                <li key={st} className={i < step ? "done" : i === step ? "active" : ""}>
                  <span className="nd-step-dot">
                    {i < step ? <Check size={11} /> : i === step ? <Loader2 size={11} className="spin" /> : null}
                  </span>
                  {st}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  // ---------- detected (high confidence, already saved) ----------
  if (state.s === "detected") {
    const x = state.x;
    return (
      <div className="nd-card">
        <span className="nd-found"><Check size={13} /> SOCIA identified your niche</span>
        <div className="nd-result">
          <h2 className="nd-niche">{x.niche}</h2>
          {x.sub_niche && <p className="nd-subniche">{x.sub_niche}</p>}
          {x.content_style && <p className="nd-style">{x.content_style}</p>}
        </div>
        <p className="nd-sub">{x.summary}</p>
        {x.signals.length > 0 && (
          <div className="nd-signals">
            <small>Signals detected</small>
            <div>
              {x.signals.map((s) => (
                <span key={s} className="nd-signal">{s}</span>
              ))}
            </div>
          </div>
        )}
        <div className="nd-confbar">
          <small>Confidence · {x.confidence}%</small>
          <span><i style={{ width: `${x.confidence}%` }} /></span>
        </div>
        <div className="nd-actions">
          <button className="btn-primary db2-ask" onClick={() => router.refresh()} type="button">
            Looks right — see your trends <ChevronRight size={15} />
          </button>
          <button className="nd-mini" onClick={() => setView("choose")} type="button">
            Change niche
          </button>
        </div>
      </div>
    );
  }

  // ---------- low confidence ----------
  if (state.s === "low") {
    const x = state.x;
    const options = x.candidates.length ? x.candidates : [{ niche: x.niche, why: x.summary }];
    return (
      <div className="nd-card">
        <h2 className="nd-title">We found a few directions.</h2>
        <p className="nd-sub">Your content points more than one way. What best describes it?</p>
        <div className="nd-cands">
          {options.map((c) => (
            <button key={c.niche} className="nd-cand" onClick={() => choose(c.niche)} type="button">
              <b>{c.niche}</b>
              <small>{c.why}</small>
            </button>
          ))}
        </div>
        <button className="nd-mini mt" onClick={() => { setState({ s: "insufficient", posts: mediaCount ?? 0 }); }} type="button">
          Describe it myself
        </button>
        {err && <p className="nd-err">{err}</p>}
      </div>
    );
  }

  // ---------- insufficient content / describe ----------
  return (
    <div className="nd-card">
      <h2 className="nd-title">Tell SOCIA what you&apos;re building.</h2>
      <p className="nd-sub">
        {state.posts > 0
          ? "Tell us what you plan to post about and we'll build your intelligence feed around it."
          : "We don't have enough content to identify your niche yet. Tell us what you plan to post about and we'll build your intelligence feed around it."}
      </p>
      <label className="nd-label" htmlFor="nd-describe">What will you create content about?</label>
      <textarea
        id="nd-describe"
        className="nd-input"
        rows={3}
        placeholder="NYC pizza reviews and restaurant recommendations"
        value={describeText}
        onChange={(e) => setDescribeText(e.target.value)}
      />
      <div className="nd-actions">
        <button className="btn-primary db2-ask" onClick={describe} type="button">
          <Sparkles size={15} /> Identify my niche
        </button>
      </div>
      {err && <p className="nd-err">{err}</p>}
      <div className="nd-orlabel">Or choose a category</div>
      <div className="nd-grid">
        {NICHES.map((n) => (
          <button key={n} className="nd-opt" onClick={() => choose(n)} type="button">
            {n}
          </button>
        ))}
      </div>
      <p className="nd-foot">
        Connected but expected auto-detection? <Link href="/settings">Check your connection</Link>.
      </p>
    </div>
  );
}
