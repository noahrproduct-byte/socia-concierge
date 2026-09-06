"use client";

// Shared top bar: global search (pages + the user's own posts), recent
// activity behind the bell, and the account menu. Nothing decorative.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, CalendarCheck2, CheckCircle2, AlertTriangle, FileText, RefreshCw, FilePen } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { relTime, type Activity } from "@/lib/overview";

export type SearchItem = { kind: "page" | "post"; label: string; hint?: string; href: string };

const ACT_ICON = { scheduled: CalendarCheck2, published: CheckCircle2, failed: AlertTriangle, draft: FilePen, plan: FileText, sync: RefreshCw } as const;

export default function TopBar({ email, plan, index, activity }: { email?: string | null; plan: "free" | "pro"; index: SearchItem[]; activity: Activity[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [bell, setBell] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDoc); };
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return index.filter((i) => i.kind === "page").slice(0, 6);
    return index.filter((i) => i.label.toLowerCase().includes(s) || i.hint?.toLowerCase().includes(s)).slice(0, 8);
  }, [q, index]);
  useEffect(() => setSel(0), [q]);

  const go = (item: SearchItem) => {
    setOpen(false);
    setQ("");
    if (item.href.startsWith("http")) window.open(item.href, "_blank", "noreferrer");
    else router.push(item.href);
  };

  return (
    <header className="tb">
      <div className="tb-search" ref={wrapRef}>
        <Search size={15} className="tb-search-ico" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search anything..."
          aria-label="Search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && results[sel]) go(results[sel]);
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        <kbd className="tb-kbd">⌘K</kbd>
        {open && (
          <ul className="tb-results" role="listbox">
            {results.length ? results.map((r, i) => (
              <li key={r.href + r.label} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); go(r); }}>
                <span className={`tb-kind ${r.kind}`}>{r.kind === "page" ? "Page" : "Post"}</span>
                <span className="tb-res-label">{r.label}</span>
                {r.hint && <small>{r.hint}</small>}
              </li>
            )) : <li className="tb-none">No matches for &ldquo;{q}&rdquo;</li>}
          </ul>
        )}
      </div>
      <div className="tb-right">
        <div className="tb-bell" ref={bellRef}>
          <button type="button" className={`tb-iconbtn${bell ? " on" : ""}`} aria-label="Recent activity" aria-expanded={bell} onClick={() => setBell((v) => !v)}>
            <Bell size={16} />
            {activity.some((a) => a.kind === "failed") && <span className="tb-bell-dot danger" aria-hidden />}
          </button>
          {bell && (
            <div className="tb-pop" role="dialog" aria-label="Recent activity">
              <div className="tb-pop-head"><b>Recent activity</b><Link href="/calendar" onClick={() => setBell(false)}>Calendar</Link></div>
              {activity.length ? (
                <ul className="tb-acts">
                  {activity.map((a) => {
                    const Icon = ACT_ICON[a.kind];
                    return (
                      <li key={a.id}>
                        <span className={`tb-act-ico ${a.kind}`}><Icon size={13} /></span>
                        <span className="tb-act-body"><b>{a.title}</b><small>{a.detail}</small></span>
                        <time dateTime={a.at}>{relTime(a.at)}</time>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="tb-none">Nothing yet. Scheduled posts, generated plans and syncs show up here.</p>}
            </div>
          )}
        </div>
        <AccountMenu email={email} plan={plan} placement="below" />
      </div>
    </header>
  );
}
