"use client";

// Video ideas on the Dashboard: pick the kinds of video (talking to the
// camera, filmed in person, animation), optionally say what about, and SOCIA
// writes ideas that follow the theme of the account's own posts, each with a
// shot-by-shot plan, the words to say, the sound and the length. One batch
// counts against the plan's weekly content ideas. The last set stays on the
// brand, so it's still here after a reload.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Clapperboard, Copy, Lightbulb } from "lucide-react";
import { Button, Card, CardHeader, Checkbox, Chip, Field, Input, ReelRefNote } from "@/components/system";
import PlanNotice, { UsageLine } from "./PlanNotice";
import PlaceScan from "./PlaceScan";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import { EVIDENCE_LABEL, IDEA_STYLES, TREATMENT_LABEL, ideaText, type IdeaSet, type IdeaStyle, type VideoIdea } from "@/lib/ideas/videoIdeas";
import { handFiles } from "@/lib/studioClips/handoff";
import { PROMPT_MAX } from "@/lib/studioClips/reference";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const SOUND: Record<VideoIdea["sound"]["kind"], string> = { original: "Its own sound", music: "Music", voiceover: "Voiceover" };
const styleLabel = (s: IdeaStyle) => IDEA_STYLES.find((x) => x.id === s)?.label ?? s;

export default function VideoIdeasCard() {
  const router = useRouter();
  const [set, setSet] = useState<IdeaSet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [styles, setStyles] = useState<IdeaStyle[]>(["face", "in_person"]);
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  // Whether this plan can have SOCIA make an idea in the Video editor; the button only shows when it can.
  const [canMake, setCanMake] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ideas").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      const s = (j?.set as IdeaSet | null) ?? null;
      setSet(s);
      setCanMake(j?.canMake === true);
      if (s?.styles.length) setStyles(s.styles);
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const toggle = (s: IdeaStyle) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const generate = async () => {
    setBusy(true); setError(null); setPlanError(null);
    const res = await fetch("/api/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ styles, about: about.trim() || null }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !j?.set) { if (isPlanError(j)) setPlanError(j); else setError(j?.error ?? "SOCIA couldn't write ideas just now. Try again."); return; }
    setSet(j.set as IdeaSet);
    setOpen((j.set as IdeaSet).ideas[0]?.id ?? null);
    if (j.usage) setUsage(j.usage as UsageSnapshot);
  };

  const copy = async (idea: VideoIdea) => {
    try { await navigator.clipboard.writeText(ideaText(idea)); setCopied(idea.id); setTimeout(() => setCopied(null), 1500); } catch { /* no clipboard */ }
  };

  const makeIt = (idea: VideoIdea) => {
    handFiles("edit", [], { prompt: ideaText(idea).slice(0, PROMPT_MAX) });
    router.push("/studio?mode=edit");
  };

  return (
    <Card className="dash-ideas">
      <CardHeader title={<><Lightbulb size={15} aria-hidden /> Video ideas</>} actions={usage ? <UsageLine meter="content_ideas" used={usage.used} limit={usage.limit} resetsOn={usage.resetsOn} /> : null} />
      <p className="dash-ideas-lead">What to film next, following the theme of your own posts: every shot, what to say, the sound and the length.</p>

      {styles.some((s) => s !== "animation") && <PlaceScan variant="inline" />}

      <div className="dash-ideas-form">
        <fieldset className="dash-ideas-styles">
          <legend>Kinds of video</legend>
          {IDEA_STYLES.map((s) => (
            <Checkbox key={s.id} checked={styles.includes(s.id)} onChange={() => toggle(s.id)} disabled={busy} label={<><b>{s.label}</b> <span className="dash-ideas-hint">{s.hint}</span></>} />
          ))}
        </fieldset>
        <Field label="About" optional>
          <Input value={about} maxLength={200} disabled={busy} placeholder="For example: our new weekend menu" onChange={(e) => setAbout(e.target.value)} />
        </Field>
        <div className="dash-ideas-go">
          <Button variant="primary" busy={busy} disabled={!styles.length} onClick={() => void generate()}><Lightbulb size={14} aria-hidden /> {busy ? "Writing your ideas (about a minute)" : set ? "Generate new ideas" : "Generate ideas"}</Button>
          {!styles.length && <span className="dash-ideas-hint">Pick at least one kind of video.</span>}
        </div>
      </div>

      {planError && <PlanNotice error={planError} compact />}
      {error && <p className="dash-ideas-err" role="alert">{error}</p>}

      {loaded && set && (
        <ol className="dash-ideas-list">
          {set.ideas.map((idea) => {
            const isOpen = open === idea.id;
            return (
              <li key={idea.id} className={isOpen ? "is-open" : ""}>
                <button type="button" className="dash-ideas-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : idea.id)}>
                  <span className="dash-ideas-title"><b>{idea.title}</b><span className="dash-ideas-meta"><Chip>{TREATMENT_LABEL[idea.treatment] ?? styleLabel(idea.style)}</Chip> about {idea.lengthSec} seconds · {idea.shots.length} shots</span></span>
                  {isOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                </button>
                <p className="dash-ideas-premise">{idea.premise}</p>
                {isOpen && (
                  <div className="dash-ideas-body">
                    {(idea.themeFit || idea.evidence) && <p className="dash-ideas-fit"><b>Why it fits your theme</b> {idea.evidence && <span className={`dash-ideas-evidence is-${idea.evidence}`}>{EVIDENCE_LABEL[idea.evidence]}.</span>} {idea.themeFit}</p>}
                    {idea.ref && <ReelRefNote r={idea.ref} />}
                    <div className="dash-ideas-shots" role="table" aria-label={`Shots for ${idea.title}`}>
                      <div role="row" className="dash-ideas-row dash-ideas-row-h"><span role="columnheader">When</span><span role="columnheader">On camera</span><span role="columnheader">On screen</span><span role="columnheader">Say</span></div>
                      {idea.shots.map((s, k) => (
                        <div role="row" className="dash-ideas-row" key={k}>
                          <span role="cell" className="dash-ideas-when">{clock(s.from)} to {clock(s.to)}</span>
                          <span role="cell">{s.onCamera}</span>
                          <span role="cell">{s.onScreenText ? `“${s.onScreenText}”` : <span className="dash-ideas-none">None</span>}</span>
                          <span role="cell">{s.say ? `“${s.say}”` : <span className="dash-ideas-none">Nothing</span>}</span>
                        </div>
                      ))}
                    </div>
                    {idea.script && <div className="dash-ideas-block"><b>Script</b><p>{idea.script}</p></div>}
                    <dl className="dash-ideas-facts">
                      <div><dt>Sound</dt><dd>{SOUND[idea.sound.kind]}{idea.sound.feel ? `: ${idea.sound.feel}` : ""}</dd></div>
                      <div><dt>Length</dt><dd>About {idea.lengthSec} seconds</dd></div>
                      {idea.needs && <div><dt>You need</dt><dd>{idea.needs}</dd></div>}
                      {idea.caption && <div><dt>Caption</dt><dd>{idea.caption}</dd></div>}
                    </dl>
                    <div className="dash-ideas-actions">
                      {canMake && idea.style !== "animation" && <Button size="sm" variant="secondary" onClick={() => makeIt(idea)}><Clapperboard size={13} aria-hidden /> Make it in the Video editor</Button>}
                      <Button size="sm" variant="ghost" onClick={() => void copy(idea)}>{copied === idea.id ? <><Check size={13} aria-hidden /> Copied</> : <><Copy size={13} aria-hidden /> Copy the plan</>}</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {loaded && set && <p className="dash-ideas-note">Written {new Date(set.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{set.about ? ` about “${set.about}”` : ""}, from your synced posts and brand settings{set.ideas.some((i) => i.ref) ? ", and Reels that took off in your niche" : ""}. Generating again replaces them.</p>}
    </Card>
  );
}
