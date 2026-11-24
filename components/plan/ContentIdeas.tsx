"use client";

// Content ideas, above the weekly plan: help with one video without making a
// whole week. "Give me an idea" for someone who doesn't know what to post;
// "Help me make a video" for someone who has one in mind. Both open Ask SOCIA
// with the request sent, which already does the work in stages: it reads
// what is wanted, finds real public videos like it (YouTube search, with their
// links and numbers) and the Reels working in the niche, offers directions to
// choose from, then writes the script and filming brief, and changes one part
// when asked ("make the hook stronger"). From there the script goes to the
// plan or the video editor without being written again. Ask SOCIA's own credit
// price applies; nothing here charges on its own.
import { useState } from "react";
import { Lightbulb, Video } from "lucide-react";
import { askSocia } from "@/lib/ask";
import { contentIdeasQuestion, IDEAS_MAX as MAX, type IdeasMode as Mode } from "@/lib/contentIdeas";

export default function ContentIdeas() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const send = () => {
    if (!mode || (mode === "video" && !text.trim())) return;
    askSocia({ question: contentIdeasQuestion(mode, text), autoSend: true, context: { page: "plan" }, contextLabel: mode === "idea" ? "One video idea" : "Help me make a video" });
    setText("");
  };

  return (
    <section className="cpl-ideasx" aria-labelledby="cpl-ideasx-h">
      <div className="cpl-ideasx-head">
        <h2 id="cpl-ideasx-h">Content ideas</h2>
        <p>One video at a time, without making a whole week.</p>
      </div>
      <div className="cpl-ideasx-choices" role="group" aria-label="What do you need?">
        <button type="button" className={`cpl-ideasx-choice${mode === "idea" ? " is-on" : ""}`} aria-pressed={mode === "idea"} onClick={() => setMode(mode === "idea" ? null : "idea")}>
          <Lightbulb size={16} aria-hidden />
          <span><b>Give me an idea</b><small>You don&apos;t know what to post. SOCIA picks one from your results, your competitors and your niche.</small></span>
        </button>
        <button type="button" className={`cpl-ideasx-choice${mode === "video" ? " is-on" : ""}`} aria-pressed={mode === "video"} onClick={() => setMode(mode === "video" ? null : "video")}>
          <Video size={16} aria-hidden />
          <span><b>Help me make a video</b><small>You have something in mind. SOCIA finds videos like it that did well, then writes yours.</small></span>
        </button>
      </div>
      {mode && (
        <form className="cpl-ideasx-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="cpl-ideasx-text">{mode === "idea" ? <>About anything in particular? <span>Optional</span></> : "What video do you want to make?"}</label>
          <textarea id="cpl-ideasx-text" rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={mode === "idea" ? "A new menu item, a busy Friday night, a question customers ask" : "Tell SOCIA the video you want to make, even if it's a rough idea. For example: how I built an AI startup at 16."} />
          <div className="cpl-ideasx-row">
            <button type="submit" className="ov-btn primary" disabled={mode === "video" && !text.trim()}>{mode === "idea" ? "Get one idea" : "Research it"}</button>
            <small>Opens in Ask SOCIA and counts as a question there. You choose the direction before the script is written, and can add it to your plan or open it in the editor.</small>
          </div>
          <small className="cpl-ideasx-note">SOCIA searches YouTube for public videos by topic and reads the Reels of accounts in your niche. Instagram and TikTok can&apos;t be searched by topic, so examples from there come from your competitors and the niche accounts SOCIA already reads for you.</small>
        </form>
      )}
    </section>
  );
}
