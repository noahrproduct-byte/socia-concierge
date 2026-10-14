// The consent screen's content: what the app asked for, what it can never
// do, and which Brand Workspaces it may read. Plain markup posting to
// /oauth/decision; the page decides everything else.
import { ShieldCheck, Eye, Ban } from "lucide-react";
import { SCOPE_LABEL } from "@/lib/oauth/config";

export type ConsentWorkspace = { id: string; name: string; note: string | null; checked: boolean };

export default function ConsentScreen({
  name, host, scopes, askedForDrafts, workspaces, requestId, email,
}: {
  name: string;
  host: string;
  scopes: string[];
  askedForDrafts: boolean;
  workspaces: ConsentWorkspace[];
  requestId: string;
  email: string | null;
}) {
  return (
    <>
      <h1>Connect {name} to SOCIA</h1>
      <p className="oa-sub">
        <b>{name}</b> is asking to use your SOCIA account. When you answer, you go back to <b>{host}</b>.
      </p>

      <form method="post" action="/oauth/decision" className="oa-form">
        <input type="hidden" name="request_id" value={requestId} />

        <section className="oa-sec">
          <h2>It will be able to</h2>
          <ul className="oa-list">
            {scopes.map((s) => <li key={s}><Eye size={14} aria-hidden /> {SCOPE_LABEL[s] ?? s}</li>)}
          </ul>
          {askedForDrafts && <p className="oa-note">It also asked to create drafts. That isn&apos;t available yet, so it gets read access only.</p>}
          <ul className="oa-list muted">
            <li><Ban size={14} aria-hidden /> It can&apos;t publish, schedule, delete or change anything.</li>
            <li><ShieldCheck size={14} aria-hidden /> It never sees your Instagram, Facebook, YouTube or TikTok logins.</li>
          </ul>
        </section>

        <section className="oa-sec">
          <h2>Which Brand Workspaces can it see?</h2>
          <div className="oa-ws">
            {workspaces.map((w) => (
              <label key={w.id} className="oa-check">
                <input type="checkbox" name="workspace" value={w.id} defaultChecked={w.checked} />
                <span>{w.name}{w.note ? <small> · {w.note}</small> : null}</span>
              </label>
            ))}
          </div>
        </section>

        <div className="oa-actions">
          <button type="submit" name="decision" value="deny" className="oa-btn ghost">Cancel</button>
          <button type="submit" name="decision" value="allow" className="oa-btn primary">Allow</button>
        </div>
      </form>

      <p className="oa-foot">
        Signed in as {email ?? "you"}. You can disconnect {name} at any time in Settings → AI Assistants.
      </p>
    </>
  );
}
