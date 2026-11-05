"use client";

// Plan posts handed to you to film (lib/teamWorkServer). Each one says the
// day, what to film and where, as the plan wrote it, with the way to make
// the post. Adding the footage to the post (Make the post) finishes it and
// tells whoever handed it out; "Mark as filmed" does the same when the
// footage went somewhere else.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, PenSquare } from "lucide-react";
import { Button, ButtonLink, Card, CardHeader, Textarea, Field } from "@/components/system";
import { dueLabel, TASK_NOTE_MAX, type MyTask } from "@/lib/teamWork";
import "../teamwork.css";

export default function YourTasks({ tasks }: { tasks: MyTask[] }) {
  return (
    <Card id="your-tasks" className="dash-lift">
      <CardHeader title={tasks.length === 1 ? "A video for you to film" : `${tasks.length} videos for you to film`} actions={<a href="/plan" className="s-link">Plan</a>} />
      <ul className="tw-tasks">
        {tasks.map((t) => <TaskItem key={t.id} t={t} />)}
      </ul>
    </Card>
  );
}

function TaskItem({ t }: { t: MyTask }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = dueLabel(t.dueOn);

  const markDone = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done", note }) }).catch(() => null);
    if (!r?.ok) {
      const j = r ? ((await r.json().catch(() => null)) as { error?: string } | null) : null;
      setError(j?.error ?? "SOCIA couldn't save that. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
  };

  return (
    <li className="tw-task">
      <div className="tw-task-head">
        <h4>{t.title}</h4>
        <span className={`tw-task-meta${due?.late ? " tw-late" : ""}`} suppressHydrationWarning>{[t.day ? `${t.day}'s post` : null, due?.text].filter(Boolean).join(". ")}</span>
      </div>
      {t.hook && <p><b>Hook:</b> {t.hook}</p>}
      {t.direction && <p><b>Where to film:</b> {t.direction}</p>}
      {t.note && <p><b>Note:</b> “{t.note}”</p>}
      {marking ? (
        <form className="tw-done-note" onSubmit={(e) => { e.preventDefault(); void markDone(); }}>
          <Field label="Where the footage is" optional>
            <Textarea rows={2} maxLength={TASK_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: sent to you on WhatsApp" />
          </Field>
          <div className="tw-actions">
            <Button type="submit" size="sm" variant="primary" busy={busy}>Mark as filmed</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMarking(false)}>Cancel</Button>
          </div>
          {error && <p className="tw-err" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="tw-actions">
          <ButtonLink href={t.createHref} size="sm" variant="primary"><PenSquare aria-hidden /> Make the post</ButtonLink>
          {t.studioHref && <ButtonLink href={t.studioHref} size="sm"><Clapperboard aria-hidden /> Shot list</ButtonLink>}
          <Button size="sm" variant="ghost" onClick={() => setMarking(true)}>Filmed it somewhere else</Button>
        </div>
      )}
    </li>
  );
}
