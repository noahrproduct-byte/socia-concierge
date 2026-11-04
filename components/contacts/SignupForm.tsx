"use client";

// The form on a brand's public sign-up page (app/l/[slug]).
import { useState } from "react";
import { Button, Checkbox, Field, Input } from "@/components/system";

export default function SignupForm({ slug, button, askHandle, brand }: { slug: string; button: string; askHandle: boolean; brand: string | null }) {
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const who = brand ?? "this brand";

  if (done) return <p className="su-done" role="status">You&apos;re signed up. {brand ? `${brand} will` : "They will"} be in touch.</p>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch(`/api/l/${encodeURIComponent(slug)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, handle: askHandle ? handle : undefined, consent, website }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) { setError(j?.error ?? "That didn't go through. Try again."); return; }
    setDone(true);
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {askHandle && (
        <Field label="Your Instagram name" optional>
          <Input autoComplete="off" placeholder="@yourname" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </Field>
      )}
      <div className="su-hp" aria-hidden>
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label={`I agree that ${who} can contact me by email.`} />
      {error && <p className="ct-err" role="alert">{error}</p>}
      <Button type="submit" variant="primary" busy={busy} disabled={!email || !consent}>{button}</Button>
      <p className="su-fine">Your email goes only to {who}. SOCIA hosts this page; see the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</p>
    </form>
  );
}
