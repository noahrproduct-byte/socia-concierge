"use client";

// The chip input for Instagram usernames (Tag people, Collaborators) with
// suggestions from the accounts SOCIA already knows for this brand. Typing
// narrows the list; ↑/↓ and Enter or a click pick one; Enter with nothing
// highlighted adds exactly what was typed — any username still works.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/lib/publishing/people";
import { rankPeople, SOURCE_LABEL } from "@/lib/publishing/people";

// One list per account per minute, shared by every field on the page.
const cache = new Map<string, { at: number; p: Promise<Person[]> }>();
function loadPeople(accountId: string): Promise<Person[]> {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = fetch("/api/publishing/instagram/people")
    .then((r) => (r.ok ? r.json() : { people: [] }))
    .then((j: { people?: Person[] }) => j.people ?? [])
    .catch(() => [] as Person[]);
  cache.set(accountId, { at: Date.now(), p });
  return p;
}

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
  const listId = useRef(`un-${Math.random().toString(36).slice(2)}`).current;

  const ensure = () => { if (!people) void loadPeople(accountId).then(setPeople); };
  useEffect(() => { setPeople(null); }, [accountId]);

  const suggestions = useMemo(() => (people ? rankPeople(people, value, { exclude, excludeAccountId: accountId }) : []), [people, value, exclude, accountId]);
  const show = open && suggestions.length > 0;

  const commit = (username: string) => {
    if (!username.trim()) return;
    const err = onAdd(username);
    if (!err) { setValue(""); setActive(-1); }
  };

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
          if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % suggestions.length); return; }
          if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); return; }
          if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (show && active >= 0) commit(suggestions[active].username);
            else commit(value);
          }
        }}
        onBlur={() => { setOpen(false); setActive(-1); if (value.trim()) commit(value); }}
      />
      {show && (
        <ul className="cp-suggest" id={listId} role="listbox">
          {suggestions.map((p, i) => (
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
          ))}
          <li className="cp-suggest-foot" aria-hidden>Accounts SOCIA knows for this brand · or keep typing any username</li>
        </ul>
      )}
    </span>
  );
}
