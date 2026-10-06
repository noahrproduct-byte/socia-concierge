"use client";

// The chip input for Instagram usernames (Tag people, Collaborators) with
// suggestions from the accounts SOCIA already knows for this brand, and —
// when a Facebook Page is linked — a live check of the exact username with
// Instagram (Business Discovery). Typing narrows the list; ↑/↓ and Enter or a
// click pick one; Enter with nothing highlighted adds exactly what was typed.
// Every added username is remembered for next time.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import type { LookupResult, Person } from "@/lib/publishing/people";
import { lookupLine, rankPeople, SOURCE_LABEL } from "@/lib/publishing/people";
import { IG_USERNAME_RE, normalizeUsername } from "@/lib/publishing/igRules";

// ------------------------------------------------------------- caches ----

// One people list per account per minute, shared by every field on the page.
const peopleCache = new Map<string, { at: number; p: Promise<Person[]> }>();
function loadPeople(accountId: string): Promise<Person[]> {
  const hit = peopleCache.get(accountId);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = fetch("/api/publishing/instagram/people")
    .then((r) => (r.ok ? r.json() : { people: [] }))
    .then((j: { people?: Person[] }) => j.people ?? [])
    .catch(() => [] as Person[]);
  peopleCache.set(accountId, { at: Date.now(), p });
  return p;
}

// Lookups per username for the session; once Instagram says lookups aren't
// available (no Facebook Page), no more are attempted.
const lookupCache = new Map<string, Promise<LookupResult>>();
let lookupUnavailable: string | null = null;
export function lookupUsername(raw: string): Promise<LookupResult> | null {
  const u = normalizeUsername(raw);
  if (!IG_USERNAME_RE.test(u) || lookupUnavailable) return null;
  let p = lookupCache.get(u);
  if (!p) {
    p = fetch(`/api/publishing/instagram/lookup?username=${encodeURIComponent(u)}`)
      .then((r) => (r.ok ? r.json() : { available: true, status: "failed" }))
      .then((r: LookupResult) => { if (!r.available) lookupUnavailable = r.reason; return r; })
      .catch((): LookupResult => ({ available: true, status: "failed" }));
    lookupCache.set(u, p);
  }
  return p;
}

/** The lookup for one username, resolved; null while pending or unavailable. */
export function useLookup(username: string | null): LookupResult | null {
  const [r, setR] = useState<LookupResult | null>(null);
  useEffect(() => {
    let alive = true;
    setR(null);
    const p = username ? lookupUsername(username) : null;
    p?.then((x) => { if (alive) setR(x); });
    return () => { alive = false; };
  }, [username]);
  return r;
}

function remember(username: string, found: LookupResult | null, accountId: string) {
  const account = found && found.available && found.status === "found" ? found.account : null;
  void fetch("/api/publishing/instagram/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, found: account }) }).catch(() => null);
  // Show it next time on this page too, without waiting for the server list.
  const hit = peopleCache.get(accountId);
  if (hit) {
    hit.p = hit.p.then((list) => list.some((x) => x.username === username) ? list : [...list, { username, name: account?.name ?? null, avatar: account?.avatar ?? null, sources: ["used"], count: 1 }]);
  }
}

// --------------------------------------------------------------- chip ----

/** A chosen username, with what Instagram's lookup said about it when that's available. */
export function UsernameChip({ username, onRemove, extra }: { username: string; onRemove: () => void; extra?: ReactNode }) {
  const r = useLookup(username);
  const found = r?.available && r.status === "found" ? r.account : null;
  const missing = r?.available && r.status === "not_found";
  return (
    <span className={`cp-chip${missing ? " warn" : ""}`} title={lookupLine(r) ?? undefined}>
      {found?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cp-chip-av" src={found.avatar} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : null}
      @{username}
      {found && <Check size={11} className="cp-chip-ok" aria-label="Found on Instagram" />}
      {missing && <AlertTriangle size={11} className="cp-chip-warn" aria-label="Not found on Instagram" />}
      {extra}
      <button type="button" aria-label={`Remove ${username}`} onClick={onRemove}><X size={11} /></button>
    </span>
  );
}

// -------------------------------------------------------------- input ----

export default function UsernameInput({
  accountId, exclude, onAdd, placeholder = "username, then Enter", onTypedChange,
}: {
  /** the posting account (left out of suggestions) */
  accountId: string;
  /** usernames already chosen in this field */
  exclude: string[];
  /** returns an error message to show, or null when added */
  onAdd: (username: string) => string | null;
  placeholder?: string;
  onTypedChange?: () => void;
}) {
  const [value, setValue] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typedLookup, setTypedLookup] = useState<{ username: string; r: LookupResult } | null>(null);
  // Stable across server and client render (a random id broke hydration).
  const listId = `un-${useId().replace(/:/g, "")}`;

  const ensure = () => { if (!people) void loadPeople(accountId).then(setPeople); };
  useEffect(() => { setPeople(null); }, [accountId]);

  const typed = normalizeUsername(value);
  const suggestions = useMemo(() => (people ? rankPeople(people, value, { exclude, excludeAccountId: accountId }) : []), [people, value, exclude, accountId]);
  const exactKnown = suggestions.some((p) => p.username === typed);

  // Check the exact username with Instagram while typing (debounced).
  useEffect(() => {
    if (!typed || typed.length < 2 || !IG_USERNAME_RE.test(typed) || exactKnown || exclude.map(normalizeUsername).includes(typed)) { setTypedLookup(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      lookupUsername(typed)?.then((r) => { if (alive) setTypedLookup({ username: typed, r }); });
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [typed, exactKnown, exclude]);

  const lk = typedLookup && typedLookup.username === typed && typedLookup.r.available && typedLookup.r.status !== "failed" ? typedLookup : null;
  // The looked-up row comes first, so ↑/↓ indices are offset by it.
  const rows = lk ? 1 + suggestions.length : suggestions.length;
  const show = open && (rows > 0 || Boolean(lookupUnavailable && typed && !exactKnown && !suggestions.length));

  const commit = (username: string) => {
    if (!username.trim()) return;
    const u = normalizeUsername(username);
    const err = onAdd(u);
    if (!err) {
      const known = lookupCache.get(u);
      if (known) void known.then((r) => remember(u, r, accountId)); else remember(u, null, accountId);
      setValue(""); setActive(-1); setTypedLookup(null);
    }
  };
  const pick = (i: number) => (lk ? (i === 0 ? lk.username : suggestions[i - 1]?.username) : suggestions[i]?.username);

  return (
    <span className="cp-un">
      <input
        className="cp-chip-input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => { ensure(); setOpen(true); }}
        onChange={(e) => { setValue(e.target.value); setActive(-1); setOpen(true); ensure(); onTypedChange?.(); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && rows) { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % rows); return; }
          if (e.key === "ArrowUp" && rows) { e.preventDefault(); setActive((i) => (i <= 0 ? rows - 1 : i - 1)); return; }
          if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const chosen = show && active >= 0 ? pick(active) : null;
            commit(chosen ?? value);
          }
        }}
        onBlur={() => { setOpen(false); setActive(-1); if (value.trim()) commit(value); }}
      />
      {show && (
        <ul className="cp-suggest" id={listId} role="listbox">
          {lk && (() => {
            const r = lk.r as Exclude<LookupResult, { available: false }>;
            const found = r.status === "found" ? r.account : null;
            return (
              <li id={`${listId}-0`} role="option" aria-selected={active === 0} className={`cp-suggest-lookup ${r.status}${active === 0 ? " on" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); commit(lk.username); }} onMouseEnter={() => setActive(0)}>
                {found?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={found.avatar} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                ) : (
                  <span className="cp-suggest-ph" aria-hidden>{found ? lk.username[0]?.toUpperCase() : r.status === "not_found" ? "?" : "·"}</span>
                )}
                <span className="cp-suggest-text">
                  <b>@{lk.username} {found ? <Check size={12} className="cp-chip-ok" /> : null}</b>
                  <small>{lookupLine(r)}</small>
                </span>
              </li>
            );
          })()}
          {suggestions.map((p, n) => {
            const i = lk ? n + 1 : n;
            return (
              <li
                key={p.username}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : ""}
                // mousedown, not click: picking must happen before the input's blur
                onMouseDown={(e) => { e.preventDefault(); commit(p.username); }}
                onMouseEnter={() => setActive(i)}
              >
                {p.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                ) : (
                  <span className="cp-suggest-ph" aria-hidden>{p.username[0]?.toUpperCase()}</span>
                )}
                <span className="cp-suggest-text">
                  <b>@{p.username}</b>
                  <small>{[p.name, SOURCE_LABEL[p.sources[0]]].filter(Boolean).join(" · ")}</small>
                </span>
              </li>
            );
          })}
          <li className="cp-suggest-foot" aria-hidden>
            {lookupUnavailable ? `${lookupUnavailable} ` : ""}Suggestions are accounts SOCIA knows for this brand — or keep typing any username.
          </li>
        </ul>
      )}
    </span>
  );
}
