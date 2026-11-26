"use client";

// Help me make a video (the Planner's Content ideas): a workspace in place of the
// weekly plan, which stays as it is underneath. The person describes the video;
// SOCIA finds real videos that made a similar idea work and offers two or three
// directions (one staged request); the person picks references and a
// direction; SOCIA writes the production plan (a second request), which they
// edit freely or change one part at a time; then Make this video hands it to the
// video editor with the chosen Reel as its reference. Kept in this browser so
// leaving and coming back finds it as it was (lib/videoWorkspace.ts).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clapperboard, Copy, ExternalLink, Loader2, Search } from "lucide-react";
import { actionCredits } from "@/lib/credits/config";
import { handFiles } from "@/lib/studioClips/handoff";
import { servedVideoOf } from "@/lib/studioClips/referenceSource";
import { briefText, editorPromptOf, planItemOf, PLAN_CHANGES, type PlanChange, type WsDirection, type WsPlan, type WsRef, type WsResearch } from "@/lib/videoWorkspace";

const STORE = "socia.videoWorkspace.v1";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CHANGE_LABEL: Record<PlanChange, string> = { hook: "Improve the hook", script: "Rewrite the script", engaging: "More engaging", cinematic: "More cinematic", simpler: "Simplify filming", shorter: "Shorten it" };

type Saved = { idea: string; research: WsResearch | null; picked: string[]; chosen: string | null; plan: WsPlan | null };

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** An example of a video idea in the business's own world, so the box never shows the same line to everyone. */
export function ideaExample(niche: string | null): string {
  const n = (niche ?? "").toLowerCase();
  if (/food|restaurant|pizza|cafe|bakery/.test(n)) return "I want to show how we make our signature pizza, from dough to the first slice.";
  if (/tech|software|app|saas|business/.test(n)) return "I want to show all the features of my app in under 45 seconds.";
  if (/fitness|health|gym/.test(n)) return "I want a fast video of one workout that anyone can do at home.";
  if (/beauty|skin|hair|salon/.test(n)) return "I want a before and after of one client's transformation.";
  if (/fashion|style|clothing/.test(n)) return "I want to style one piece three different ways.";
  return "Describe the video you want to make, even if it's just a rough idea.";
}

export default function VideoWorkspace({ onBack, niche, planId, planItems, onPlanSaved }: {
  onBack: () => void; niche: string | null;
  /** the weekly plan the idea can be added to; null when there is none yet */
  planId: string | null; planItems: unknown[] | null;
  onPlanSaved?: (items: unknown[]) => void;
}) {
  const router = useRouter();
  const [s, setS] = useState<Saved>({ idea: "", research: null, picked: [], chosen: null, plan: null });
  const [busy, setBusy] = useState<"research" | "plan" | PlanChange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [day, setDay] = useState("Friday");
  const cost = actionCredits("content_ideas");

  // Back where it was: what was researched and planned stays in this browser.
  useEffect(() => { try { const v = window.localStorage.getItem(STORE); if (v) setS(JSON.parse(v) as Saved); } catch { /* none */ } }, []);
  useEffect(() => { try { window.localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* not kept */ } }, [s]);

  const refs = useMemo(() => s.research?.refs ?? [], [s.research]);
  const picked = useMemo(() => refs.filter((r) => s.picked.includes(r.key)), [refs, s.picked]);
  const chosen = s.research?.directions.find((d) => d.id === s.chosen) ?? null;

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/plan/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (!res?.ok || !j) throw new Error(typeof j?.error === "string" ? j.error : "SOCIA couldn't be reached. Check your connection and try again.");
    return j;
  };
  const research = async () => {
    if (busy || s.idea.trim().length < 6) return;
    setBusy("research"); setError(null); setNote(null);
    try {
      const j = await call({ step: "research", idea: s.idea });
      const r = { refs: (j.refs ?? []) as WsRef[], directions: (j.directions ?? []) as WsDirection[], note: (j.note as string | null) ?? null };
      setS((x) => ({ ...x, research: r, picked: r.refs.slice(0, 1).map((y) => y.key), chosen: r.directions.find((d) => d.recommended)?.id ?? null, plan: null }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const plan = async (change: PlanChange | null) => {
    if (busy || !chosen) return;
    setBusy(change ?? "plan"); setError(null); setNote(null);
    try {
      const j = await call({ step: "plan", idea: s.idea, direction: chosen, refs: picked, ...(change && s.plan ? { change, current: s.plan } : {}) });
      setS((x) => ({ ...x, plan: j.plan as WsPlan }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const edit = (patch: Partial<WsPlan>) => setS((x) => (x.plan ? { ...x, plan: { ...x.plan, ...patch } } : x));

  const makeIt = () => {
    if (!s.plan) return;
    // The chosen Reel goes to the editor's reference slot when its file can be served; the prompt never carries its link or numbers.
    const ref = picked.find((r) => r.platform === "instagram" && servedVideoOf(r));
    const reference = ref ? { url: servedVideoOf(ref)!, name: `${ref.creator} ${ref.format}.mp4` } : undefined;
    handFiles("edit", [], { prompt: editorPromptOf(s.plan), ...(reference ? { reference } : {}) });
    router.push("/studio?mode=edit");
  };
  const addToPlan = async () => {
    if (!s.plan || !planId || !planItems) return;
    setNote(null);
    const next = [...planItems, planItemOf(s.plan, day)];
    const res = await fetch("/api/plans", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: planId, weeklyPlan: next }) }).catch(() => null);
    if (!res?.ok) { setError("SOCIA couldn't add it to your weekly plan just now. Try again."); return; }
    onPlanSaved?.(next);
    setNote(`Added to your weekly plan on ${day}. Nothing else in the plan changed.`);
  };
  const copy = async () => { if (!s.plan) return; try { await navigator.clipboard.writeText(briefText(s.plan)); setNote("Filming brief copied."); } catch { setNote("Couldn't copy. Select the plan and copy it."); } };
  const reset = () => { setS({ idea: "", research: null, picked: [], chosen: null, plan: null }); setError(null); setNote(null); };

  return (
    <section className="vw" aria-labelledby="vw-h">
      <div className="vw-head">
        <button type="button" className="ov-btn ghost small" onClick={onBack}><ArrowLeft size={13} aria-hidden /> Back to my weekly plan</button>
        <h2 id="vw-h">Help me make a video</h2>
      </div>

      <form className="vw-ask" onSubmit={(e) => { e.preventDefault(); void research(); }}>
        <label htmlFor="vw-idea">What video do you want to make?</label>
        <textarea id="vw-idea" rows={3} maxLength={800} value={s.idea} disabled={Boolean(busy)} placeholder={ideaExample(niche)} onChange={(e) => setS((x) => ({ ...x, idea: e.target.value }))} />
        <div className="vw-row">
          <button type="submit" className="ov-btn primary" disabled={Boolean(busy) || s.idea.trim().length < 6}>
            {busy === "research" ? <Loader2 size={14} className="spin" /> : <Search size={14} />} {busy === "research" ? "Researching…" : s.research ? "Research again" : "Research it"}
          </button>
          <small>{cost} credits. SOCIA reads the videos it has found for your brand and other industries, searches YouTube Shorts, and picks the ones that made an idea like yours work. About 20 to 40 seconds.</small>
        </div>
      </form>
      {error && <p className="cbb-err" role="alert">{error}</p>}

      {s.research && (
        <>
          <div className="vw-sec">
            <h3>Successful videos like your idea</h3>
            {refs.length === 0 ? <p className="vw-muted">{s.research.note ?? "SOCIA didn't find videos close enough to this idea."}</p> : (
              <>
                <p className="vw-muted">Choose the ones to build on. SOCIA knows each by its caption and numbers; it hasn&apos;t watched them, so open one to see it.</p>
                <ul className="vw-refs">
                  {refs.map((r) => {
                    const on = s.picked.includes(r.key);
                    return (
                      <li key={r.key} className={on ? "on" : undefined}>
                        <a className="vw-ref-cover" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${r.creator}'s ${r.format} on ${r.platform === "youtube" ? "YouTube" : "Instagram"}`}>
                          {r.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.hidden = true; }} />
                          ) : null}
                          <span>{r.platform === "youtube" ? "YouTube" : "Instagram"} {r.format}</span>
                        </a>
                        <div className="vw-ref-body">
                          <b>{r.creator}</b>
                          <small>{[r.views != null ? `${fmt(r.views)} views` : null, r.multiplier != null ? `${r.multiplier.toFixed(1)}x their usual ${r.basis}` : null].filter(Boolean).join(", ") || "Numbers not shared"}</small>
                          {r.caption && <small className="vw-cap">Caption: &ldquo;{r.caption.slice(0, 110)}&rdquo;</small>}
                          <p>{r.why}</p>
                          {r.adapt.length > 0 && <ul>{r.adapt.map((a) => <li key={a}>{a}</li>)}</ul>}
                          <div className="vw-ref-acts">
                            <a className="ov-btn ghost small" href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden /> Watch</a>
                            <button type="button" className={`ov-btn small ${on ? "primary" : "ghost"}`} aria-pressed={on} onClick={() => setS((x) => ({ ...x, picked: on ? x.picked.filter((k) => k !== r.key) : [...x.picked, r.key] }))}>
                              {on ? <><Check size={12} aria-hidden /> Using it</> : "Use as reference"}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="vw-sec">
            <h3>Ways to make it</h3>
            <div className="vw-dirs" role="radiogroup" aria-label="Direction">
              {s.research.directions.map((d) => {
                const on = s.chosen === d.id;
                return (
                  <button key={d.id} type="button" role="radio" aria-checked={on} className={`vw-dir${on ? " on" : ""}`} disabled={Boolean(busy)} onClick={() => setS((x) => ({ ...x, chosen: d.id }))}>
                    <span className="vw-dir-top"><b>{d.title}</b>{d.recommended && <em>SOCIA recommends</em>}</span>
                    <span>{d.concept}</span>
                    <small><b>Hook:</b> {d.hook}</small>
                    <small><b>About {Math.round(d.seconds)} seconds.</b> {d.filming}</small>
                    <small><b>Editing:</b> {d.editing}</small>
                    <small className="vw-why">{d.why}</small>
                  </button>
                );
              })}
            </div>
            <div className="vw-row">
              <button type="button" className="ov-btn primary" disabled={!chosen || Boolean(busy)} onClick={() => void plan(null)}>
                {busy === "plan" ? <Loader2 size={14} className="spin" /> : <Clapperboard size={14} />} {busy === "plan" ? "Writing the plan…" : s.plan ? "Write the plan again" : "Write the production plan"}
              </button>
              <small>{cost} credits. Hook, script, shot list, editing, sound and caption for {chosen ? `"${chosen.title}"` : "the direction you choose"}{picked.length ? `, built on ${picked.length} reference${picked.length === 1 ? "" : "s"}` : ""}.</small>
            </div>
          </div>
        </>
      )}

      {s.plan && (
        <div className="vw-plan" aria-label="Production plan">
          <div className="vw-sec">
            <h3>{s.plan.title}</h3>
            <dl className="vw-over">
              {[["Goal", s.plan.objective], ["For", s.plan.audience], ["Length", `About ${Math.round(s.plan.seconds)} seconds`], ["Where", `${s.plan.platform} ${s.plan.format}`], ["Direction", s.plan.direction]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>
          <div className="vw-sec">
            <h3>Opening</h3>
            <ul className="vw-hook">
              {s.plan.hook.visual && <li><b>First thing seen:</b> {s.plan.hook.visual}</li>}
              {s.plan.hook.text && <li><b>On screen:</b> &ldquo;{s.plan.hook.text}&rdquo;</li>}
              {s.plan.hook.say && <li><b>Said:</b> &ldquo;{s.plan.hook.say}&rdquo;</li>}
              {s.plan.hook.sound && <li><b>Sound:</b> {s.plan.hook.sound}</li>}
            </ul>
          </div>
          {s.plan.script && (
            <div className="vw-sec">
              <h3>Script</h3>
              <textarea className="vw-script" rows={6} value={s.plan.script} disabled={Boolean(busy)} onChange={(e) => edit({ script: e.target.value })} aria-label="Script, edit freely" />
              <small className="vw-muted">Edit anything here; it&apos;s free and goes to the editor as written.</small>
            </div>
          )}
          <div className="vw-sec">
            <h3>Shot list</h3>
            <ol className="vw-shots">
              {s.plan.shots.map((x, i) => (
                <li key={i}>
                  <span className="vw-time">{clock(x.from)}–{clock(x.to)}</span>
                  <div>
                    <b>{x.film}</b>
                    <small>{[x.angle, x.move].filter(Boolean).join(", ")}</small>
                    {x.say && <small>Say: &ldquo;{x.say}&rdquo;</small>}
                    {x.text && <small>On screen: &ldquo;{x.text}&rdquo;</small>}
                    {x.edit && <small>Edit: {x.edit}</small>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <details className="vw-sec vw-more" open>
            <summary>Editing, music and voiceover</summary>
            {s.plan.editing && <p><b>Editing:</b> {s.plan.editing}</p>}
            {s.plan.music && <p><b>Music:</b> {s.plan.music} Use a track you have the right to use: add it in the editor under Sound.</p>}
            {s.plan.voiceover && <p><b>Voiceover:</b> {s.plan.voiceover} The editor writes it for your approval before any audio is made.</p>}
          </details>
          <div className="vw-sec">
            <h3>Publishing</h3>
            <textarea className="vw-script" rows={4} value={s.plan.caption} disabled={Boolean(busy)} onChange={(e) => edit({ caption: e.target.value })} aria-label="Caption, edit freely" />
            {s.plan.hashtags.length > 0 && <small className="vw-muted">{s.plan.hashtags.join(" ")}</small>}
            {s.plan.cta && <p className="vw-line"><b>Call to action:</b> {s.plan.cta}</p>}
            <p className="vw-line"><b>When to post:</b> {s.plan.postTime || "SOCIA needs more of your own posts to say; use your Calendar's best window."}</p>
          </div>

          <div className="vw-changes" aria-label="Change one part">
            {(Object.keys(PLAN_CHANGES) as PlanChange[]).map((c) => (
              <button key={c} type="button" className="cbr-dir-chip" disabled={Boolean(busy)} onClick={() => void plan(c)}>{busy === c && <Loader2 size={12} className="spin" />} {CHANGE_LABEL[c]}</button>
            ))}
            <button type="button" className="cbr-dir-chip" disabled={Boolean(busy)} onClick={() => document.getElementById("vw-h")?.scrollIntoView({ behavior: "smooth" })}>Change the direction</button>
            <small className="vw-muted">Each change rewrites only that part and uses {cost} credits. Your edits to the script and caption are kept until you change those parts.</small>
          </div>

          <div className="vw-acts">
            <button type="button" className="ov-btn primary" onClick={makeIt}><Clapperboard size={14} aria-hidden /> Make this video</button>
            {planId && planItems ? (
              <span className="vw-add">
                <select aria-label="Day in your weekly plan" value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
                <button type="button" className="ov-btn ghost" onClick={() => void addToPlan()}>Add to my weekly plan</button>
              </span>
            ) : null}
            <a className="ov-btn ghost" href={`/plan/calendar?compose=1&caption=${encodeURIComponent(s.plan.caption.slice(0, 600))}`}>Schedule it</a>
            <button type="button" className="ov-btn ghost" onClick={() => void copy()}><Copy size={13} aria-hidden /> Copy filming brief</button>
            <button type="button" className="ov-btn ghost" onClick={reset}>Start another video</button>
          </div>
          <small className="vw-muted">Make this video opens the video editor with this plan as its brief{picked.some((r) => r.platform === "instagram" && servedVideoOf(r)) ? " and your chosen Reel as the reference" : ""}. You add your clips; nothing is made or charged until you press Make the video there.</small>
        </div>
      )}
      {note && <p className="vw-note" role="status">{note}</p>}
    </section>
  );
}
