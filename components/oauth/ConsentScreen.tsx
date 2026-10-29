// The consent screen's content: what the app asked for, what it can never
// do, whether it may also post (unticked unless the person ticks it), and
// which Brand Workspaces it may use. Plain markup posting to /oauth/decision;
// the page decides everything else.
import { ShieldCheck, Eye, Ban, Send } from "lucide-react";
import { SCOPE_LABEL } from "@/lib/oauth/config";

export type ConsentWorkspace = { id: string; name: string; note: string | null; checked: boolean };

export default function ConsentScreen({
  name, host, identity, scopes, askedToPublish, workspaces, requestId, email,
}: {
  name: string;
  host: string;
  /** "unverified" for an app that registered itself (it chose its own name), else the host that published its metadata. */
  identity?: string;
  scopes: string[];
  askedToPublish: boolean;
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
      {identity === "unverified" ? (
        <p className="oa-sub"><b>Unverified app.</b> It registered itself and chose this name, so SOCIA can&apos;t confirm who made it. Only continue if you started this from the app and <b>{host}</b> is its real address.</p>
      ) : identity ? (
        <p className="oa-sub">Published by <b>{identity}</b>.</p>
      ) : null}

      <form method="post" action="/oauth/decision" className="oa-form">
        <input type="hidden" name="request_id" value={requestId} />

        <section className="oa-sec">
          <h2>It will be able to</h2>
          <ul className="oa-list">
            {scopes.map((s) => <li key={s}><Eye size={14} aria-hidden /> {SCOPE_LABEL[s] ?? s}</li>)}
          </ul>
          <ul className="oa-list muted">
            <li><Ban size={14} aria-hidden /> It can&apos;t delete posts or change your settings.</li>
            <li><ShieldCheck size={14} aria-hidden /> It never sees your Instagram, Facebook, YouTube or TikTok logins.</li>
          </ul>
        </section>

        <section className="oa-sec">
          <h2>Posting</h2>
          <label className="oa-check oa-check-long">
            <input type="checkbox" name="publish" />
            <span className="oa-check-text">
              <span><Send size={13} aria-hidden /> Also let {name} create, schedule and publish posts</span>
              <small>Only to accounts connected in the Brand Workspaces below, on a paid plan. It posts as soon as you ask it to, without asking SOCIA again. You can turn this off at any time in Settings → AI Assistants.</small>
            </span>
          </label>
          {askedToPublish && <p className="oa-note">{name} asked to be able to post. Leave this unticked to give it read access only.</p>}
        </section>

        <section className="oa-sec">
          <h2>Which Brand Workspaces can it use?</h2>
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
