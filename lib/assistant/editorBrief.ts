// The brief Ask SOCIA hands the AI editor (Content Studio, Video editor) with
// the clips the person filmed for a script it wrote: what the video is, the
// beats in order (what to show, the on-screen text, what is said, how each
// cut joins the next) and the editing directions. The parts the editor has no
// use for (the caption, the sound pick, the read-aloud lines) are left out so
// the beats fit the editor's prompt limit. Browser-safe.

import { PROMPT_MAX } from "@/lib/studioClips/reference";

/** Split a script into its parts by "Label:" lines at the start of a line. */
function sections(body: string): { head: string; parts: { label: string; text: string }[] } {
  const lines = body.replace(/\r/g, "").split("\n");
  const parts: { label: string; text: string }[] = [];
  const head: string[] = [];
  let cur: { label: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = /^(Caption|Sound|Your lines|Filming notes|Editing):\s*(.*)$/i.exec(line.trim());
    if (m) {
      if (cur) parts.push({ label: cur.label, text: cur.lines.join("\n").trim() });
      cur = { label: m[1], lines: [m[2]] };
    } else if (cur) cur.lines.push(line);
    else head.push(line);
  }
  if (cur) parts.push({ label: cur.label, text: cur.lines.join("\n").trim() });
  return { head: head.join("\n").trim(), parts };
}

export function editorPrompt(draft: { title: string; body: string }, opts: { approach?: string | null } = {}): string {
  const { head, parts } = sections(draft.body);
  const editing = parts.find((p) => /^editing$/i.test(p.label))?.text ?? "";
  const intro = [
    `Edit my clips into this video: ${draft.title.trim() || "the script below"}.`,
    opts.approach?.trim() ? opts.approach.trim() : "",
    "Follow the script's beats in order: match each beat to the clip that shows it, put the on-screen text on, keep what is said, and use the transitions it names.",
    editing ? `Editing: ${editing.replace(/\s+/g, " ")}` : "",
  ].filter(Boolean).join(" ");
  const room = PROMPT_MAX - intro.length - 10;
  const beats = head.replace(/\n{3,}/g, "\n\n");
  const script = beats.length > room ? `${beats.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "")}…` : beats;
  return `${intro}\n\nScript:\n${script}`.slice(0, PROMPT_MAX);
}

/** Whether a draft is a script someone films (not a caption, hooks or a reply). */
export const isFilmedScript = (d: { kind: string; body: string } | null | undefined): boolean =>
  Boolean(d && d.kind === "script" && /\b(Film|Say|On screen):/i.test(d.body));
