"use client";

// Contacts: everyone who commented on the brand's own Instagram posts or signed
// up on its page, with tags, notes and their history. Keyword rules tag
// commenters on the next update; the sign-up page collects emails with
// consent. Nothing here messages anyone.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button, ButtonLink, Card, CardHeader, Chip, ConfirmDialog, Drawer, Empty, Field, Input, Select, Switch, TableWrap, Textarea } from "@/components/system";
import { cleanTag, type Contact, type ContactEvent, type ContactRule, type SignupPage } from "@/lib/contacts/contacts";

type Initial = { contacts: Contact[]; rules: ContactRule[]; page: SignupPage | null; migration: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function send<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = res ? await res.json().catch(() => null) : null;
  if (!res?.ok) return { ok: false, error: (j?.error as string) ?? "SOCIA couldn't do that just now. Try again." };
  return { ok: true, data: j as T };
}

export default function ContactsPage({ initial, igConnected, brand }: { initial: Initial; igConnected: boolean; brand: string | null }) {
  const [contacts, setContacts] = useState(initial.contacts);
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags))].sort(), [contacts]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return contacts.filter((c) => (!tag || c.tags.includes(tag)) && (!q || [c.handle, c.name, c.email].some((v) => v?.toLowerCase().includes(q))));
  }, [contacts, tag, query]);
  const withEmail = contacts.filter((c) => c.email).length;
  const open = contacts.find((c) => c.id === openId) ?? null;

  if (initial.migration) {
    return <p className="ct-note">Contacts need a one-time database update before they can be used: run <code>supabase/contacts.sql</code> in Supabase.</p>;
  }

  const sync = async () => {
    setSyncing(true); setSyncNote(null);
    const r = await send<{ added: number; updated: number; comments: number; problem: string | null; contacts: Contact[] }>("/api/contacts", "POST");
    setSyncing(false);
    if (!r.ok) { setSyncNote(r.error); return; }
    setContacts(r.data.contacts);
    setSyncNote(r.data.problem ?? (r.data.added || r.data.comments
      ? `${plural(r.data.added, "new contact")}, ${plural(r.data.comments, "new comment")} recorded.`
      : "No new comments since the last update."));
  };

  const replace = (c: Contact) => setContacts((all) => all.map((x) => (x.id === c.id ? { ...c, sources: x.sources } : x)));

  return (
    <div className="ct">
      <div className="ct-bar">
        <Button variant="primary" onClick={sync} busy={syncing} disabled={!igConnected}><RefreshCw size={14} aria-hidden /> Update from comments</Button>
        <Input className="ct-search" type="search" placeholder="Search name, @handle or email" aria-label="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} disabled={!tags.length}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <ButtonLink href={`/api/contacts/export${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`} variant="ghost"><Download size={14} aria-hidden /> Export CSV</ButtonLink>
      </div>
      <p className="ct-meta" role="status">
        {!igConnected ? "Connect Instagram in Settings to find the people who comment on your posts. " : null}
        {syncNote ?? `${plural(contacts.length, "contact")}, ${withEmail} with an email.`}
      </p>

      {shown.length ? (
        <TableWrap className="ct-table-wrap">
          <table className="s-table ct-table">
            <thead><tr><th>Contact</th><th>Email</th><th>Tags</th><th className="num">Comments</th><th>Last seen</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} tabIndex={0} onClick={() => setOpenId(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(c.id); } }} aria-label={`Open ${c.handle ? `@${c.handle}` : c.email}`}>
                  <td><span className="id">{c.handle ? `@${c.handle}` : c.email}</span>{c.name && <span className="sub">{c.name}</span>}</td>
                  <td>{c.email ?? <span className="ct-none">Not given</span>}</td>
                  <td><span className="ct-tags">{c.tags.length ? c.tags.map((t) => <Chip key={t}>{t}</Chip>) : <span className="ct-none">None</span>}</span></td>
                  <td className="num">{c.commentCount}</td>
                  <td>{day(c.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <Empty>
          {contacts.length ? "No contacts match this search or tag." : igConnected
            ? "No contacts yet. Update from comments to add everyone who commented on your latest posts, or share your sign-up page."
            : "No contacts yet. Connect Instagram, or share your sign-up page below."}
        </Empty>
      )}

      <div className="ct-grid">
        <RulesCard initial={initial.rules} />
        <SignupCard initial={initial.page} brand={brand} />
      </div>

      <ContactDrawer contact={open} onClose={() => setOpenId(null)} onSaved={replace} onDeleted={(id) => { setContacts((all) => all.filter((x) => x.id !== id)); setOpenId(null); }} />
    </div>
  );
}

function ContactDrawer({ contact, onClose, onSaved, onDeleted }: { contact: Contact | null; onClose: () => void; onSaved: (c: Contact) => void; onDeleted: (id: string) => void }) {
  const [events, setEvents] = useState<{ id: string; list: ContactEvent[] } | null>(null);
  const [notes, setNotes] = useState<{ id: string; text: string } | null>(null);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  // The history, loaded once per opened contact.
  const contactId = contact?.id ?? null;
  useEffect(() => {
    if (!contactId) return;
    let alive = true;
    void send<{ events: ContactEvent[] }>(`/api/contacts/${contactId}`, "GET").then((r) => { if (alive && r.ok) setEvents({ id: contactId, list: r.data.events }); });
    return () => { alive = false; };
  }, [contactId]);
  if (!contact) return null;

  const save = async (patch: { tags?: string[]; notes?: string }) => {
    setBusy(true); setError(null);
    const r = await send<{ contact: Contact }>(`/api/contacts/${contact.id}`, "PATCH", patch);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data.contact);
  };
  const addTag = () => {
    const t = cleanTag(newTag);
    if (!t || contact.tags.includes(t)) { setNewTag(""); return; }
    setNewTag("");
    void save({ tags: [...contact.tags, t] });
  };
  const remove = async () => {
    setBusy(true);
    const r = await send<{ ok: true }>(`/api/contacts/${contact.id}`, "DELETE");
    setBusy(false); setConfirm(false);
    if (!r.ok) { setError(r.error); return; }
    onDeleted(contact.id);
  };
  const name = contact.handle ? `@${contact.handle}` : (contact.email ?? "Contact");
  const notesText = notes?.id === contact.id ? notes.text : contact.notes ?? "";

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }} title={name} footer={
      <Button variant="danger" size="sm" onClick={() => setConfirm(true)} disabled={busy}><Trash2 size={13} aria-hidden /> Delete contact</Button>
    }>
      <div className="ct-drawer">
        <dl className="ct-facts">
          {contact.handle && <div><dt>Instagram</dt><dd><a href={`https://instagram.com/${contact.handle}`} target="_blank" rel="noreferrer">@{contact.handle} <ExternalLink size={11} aria-hidden /></a></dd></div>}
          <div><dt>Email</dt><dd>{contact.email ? <>{contact.email}{contact.consentAt && <span className="ct-sub">Agreed to hear from you on {day(contact.consentAt)}</span>}</> : <span className="ct-none">Not given</span>}</dd></div>
          <div><dt>Comments</dt><dd>{contact.commentCount}</dd></div>
          <div><dt>First seen</dt><dd>{day(contact.firstSeen)}</dd></div>
        </dl>

        <Field label="Tags">
          <div className="ct-tag-edit">
            {contact.tags.map((t) => (
              <Chip key={t} className="ct-tag">{t}<button type="button" aria-label={`Remove tag ${t}`} disabled={busy} onClick={() => void save({ tags: contact.tags.filter((x) => x !== t) })}><X size={11} aria-hidden /></button></Chip>
            ))}
            <Input className="ct-tag-input" placeholder="Add a tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
            <Button size="sm" variant="ghost" onClick={addTag} disabled={busy || !cleanTag(newTag)}><Plus size={13} aria-hidden /> Add</Button>
          </div>
        </Field>

        <Field label="Notes">
          <Textarea rows={3} value={notesText} maxLength={1000} onChange={(e) => setNotes({ id: contact.id, text: e.target.value })} />
        </Field>
        <Button size="sm" onClick={() => void save({ notes: notesText })} disabled={busy || notesText === (contact.notes ?? "")}>Save notes</Button>
        {error && <p className="ct-err" role="alert">{error}</p>}

        <h3 className="ct-h3">History</h3>
        {events?.id === contact.id && events.list.length ? (
          <ul className="ct-history">
            {events.list.map((e) => (
              <li key={`${e.kind}${e.ref}`}>
                <span className="ct-when">{day(e.at)}</span>
                {e.kind === "signup" ? <span>Signed up on your page</span> : <span>Commented: “{e.excerpt}”</span>}
              </li>
            ))}
          </ul>
        ) : <p className="ct-none">Nothing recorded yet.</p>}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete ${name}?`} body="Their tags, notes and history are deleted from SOCIA. If they comment again, they come back as a new contact." confirmLabel="Delete contact" danger busy={busy} onConfirm={remove} />
    </Drawer>
  );
}

function RulesCard({ initial }: { initial: ContactRule[] }) {
  const [rows, setRows] = useState(initial.map((r) => ({ keyword: r.keyword, tag: r.tag })));
  const [saved, setSaved] = useState(JSON.stringify(rows));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const dirty = JSON.stringify(rows) !== saved;
  const set = (i: number, k: "keyword" | "tag", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    setBusy(true); setNote(null);
    const r = await send<{ rules: ContactRule[] }>("/api/contacts/rules", "PUT", { rules: rows });
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    const next = r.data.rules.map((x) => ({ keyword: x.keyword, tag: x.tag }));
    setRows(next); setSaved(JSON.stringify(next)); setNote("Saved. Matching comments are tagged on the next update.");
  };
  return (
    <Card>
      <CardHeader title="Keyword tags" />
      <p className="ct-help">When a comment contains a keyword, its author gets the tag. For example, anyone who comments “beta” gets “wants early access”.</p>
      {rows.length ? (
        <ul className="ct-rules">
          {rows.map((r, i) => (
            <li key={i}>
              <Input aria-label="Keyword" placeholder="Keyword" value={r.keyword} onChange={(e) => set(i, "keyword", e.target.value)} />
              <Input aria-label="Tag" placeholder="Tag" value={r.tag} onChange={(e) => set(i, "tag", e.target.value)} />
              <Button size="sm" variant="ghost" aria-label="Remove this rule" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><X size={13} aria-hidden /></Button>
            </li>
          ))}
        </ul>
      ) : <p className="ct-none">No keyword tags yet.</p>}
      <div className="ct-actions">
        <Button size="sm" variant="ghost" onClick={() => setRows((x) => [...x, { keyword: "", tag: "" }])} disabled={rows.length >= 30}><Plus size={13} aria-hidden /> Add a keyword</Button>
        <Button size="sm" variant="primary" onClick={save} busy={busy} disabled={!dirty}>Save</Button>
      </div>
      {note && <p className="ct-meta" role="status">{note}</p>}
    </Card>
  );
}

function SignupCard({ initial, brand }: { initial: SignupPage | null; brand: string | null }) {
  const suggested = (brand ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [page, setPage] = useState<SignupPage | null>(initial);
  const [form, setForm] = useState({
    slug: initial?.slug ?? suggested, title: initial?.title ?? (brand ? `Join the ${brand} list` : "Join the list"),
    intro: initial?.intro ?? "", button: initial?.button ?? "Sign up", askHandle: initial?.askHandle ?? true, tag: initial?.tag ?? "", active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = page ? `${typeof window === "undefined" ? "https://sociaos.com" : window.location.origin}/l/${page.slug}` : null;
  const save = async () => {
    setBusy(true); setNote(null);
    const r = await send<{ page: SignupPage }>("/api/contacts/page", "PUT", form);
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    setPage(r.data.page); setForm((f) => ({ ...f, slug: r.data.page.slug })); setNote("Saved.");
  };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setNote(link); }
  };
  return (
    <Card>
      <CardHeader title="Sign-up page" actions={link && page?.active ? <a className="ct-link" href={link} target="_blank" rel="noreferrer">Open <ExternalLink size={11} aria-hidden /></a> : null} />
      <p className="ct-help">A page SOCIA hosts for you. Put the link in your bio or a caption: people leave their email (and their Instagram name if you ask), agree to hear from you, and appear here.</p>
      {link && (
        <div className="ct-linkrow">
          <code>{link}</code>
          <Button size="sm" variant="ghost" onClick={copy}>{copied ? <><Check size={13} aria-hidden /> Copied</> : <><Copy size={13} aria-hidden /> Copy link</>}</Button>
        </div>
      )}
      <div className="ct-form">
        <Field label="Address" hint="sociaos.com/l/ followed by this">
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </Field>
        <Field label="Title"><Input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="A line under the title" optional><Textarea rows={2} maxLength={400} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} /></Field>
        <Field label="Button"><Input value={form.button} maxLength={30} onChange={(e) => setForm({ ...form, button: e.target.value })} /></Field>
        <Field label="Tag everyone who signs up" optional><Input value={form.tag} placeholder="for example waitlist" onChange={(e) => setForm({ ...form, tag: e.target.value })} /></Field>
        <div className="ct-switches">
          <Switch checked={form.askHandle} onCheckedChange={(v) => setForm({ ...form, askHandle: v })} label="Ask for their Instagram name" /> <span>Ask for their Instagram name</span>
        </div>
        <div className="ct-switches">
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} label="Page is live" /> <span>{form.active ? "Page is live" : "Page is switched off"}</span>
        </div>
      </div>
      <div className="ct-actions">
        <Button size="sm" variant="primary" onClick={save} busy={busy}>{page ? "Save changes" : "Create the page"}</Button>
      </div>
      {note && <p className="ct-meta" role="status">{note}</p>}
    </Card>
  );
}
