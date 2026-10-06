"use client";

// Shared top bar: global search (pages + the user's own posts), recent
// activity behind the bell, and the account menu. Nothing decorative.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, CalendarCheck2, CheckCircle2, AlertTriangle, FileText, RefreshCw, FilePen, TrendingUp, Zap, Users, Flame, Lightbulb, X } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { AskHost } from "@/components/AskSocia";
import { relTime, type Activity } from "@/lib/overview";
import type { PlanId } from "@/lib/plans";

export type SearchItem = { kind: "page" | "post"; label: string; hint?: string; href: string };
export type AlertItem = { id: string; type: string; severity: "good" | "info" | "warning"; title: string; body: string; detectedAt: string; readAt: string | null; entityRef: string | null };

const ACT_ICON = { scheduled: CalendarCheck2, published: CheckCircle2, failed: AlertTriangle, draft: FilePen, plan: FileText, sync: RefreshCw } as const;
const ALERT_ICON: Record<string, typeof Zap> = {
  breakout: Zap,
  performance_change: TrendingUp,
  competitor_move: Users,
  trend: Flame,
  opportunity: Lightbulb,
  plan_result: CheckCircle2,
  plan_ready: FileText,
};

export default function TopBar({ email, plan, index, activity, alerts = [], unread = 0 }: { email?: string | null; plan: PlanId; index: SearchItem[]; activity: Activity[]; alerts?: AlertItem[]; unread?: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [bell, setBell] = useState(false);
  const [items, setItems] = useState<AlertItem[]>(alerts);
  const [unreadN, setUnreadN] = useState(unread);
  useEffect(() => { setItems(alerts); setUnreadN(unread); }, [alerts, unread]);

  // Opening the bell marks the alerts read (optimistically); a failed publish
  // still shows its own red dot from the activity feed.
  const openBell = () => {
    setBell((v) => {
      const next = !v;
      if (next && unreadN > 0) {
        setUnreadN(0);
        setItems((xs) => xs.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })));
        fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read" }), keepalive: true }).catch(() => {});
      }
      return next;
    });
  };
  const dismiss = (id: string) => {
    setItems((xs) => xs.filter((a) => a.id !== id));
    fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dismiss", id }), keepalive: true }).catch(() => {});
  };
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
        <AskHost />
        <div className="tb-bell" ref={bellRef}>
          <button type="button" className={`tb-iconbtn${bell ? " on" : ""}`} aria-label={`Notifications${unreadN > 0 ? `, ${unreadN} unread` : ""}`} aria-expanded={bell} onClick={openBell}>
            <Bell size={16} />
            {unreadN > 0 ? <span className="tb-bell-badge" aria-hidden>{unreadN > 9 ? "9+" : unreadN}</span>
              : activity.some((a) => a.kind === "failed") && <span className="tb-bell-dot danger" aria-hidden />}
          </button>
          {bell && (
            <div className="tb-pop" role="dialog" aria-label="Notifications">
              <div className="tb-pop-head"><b>Notifications</b><Link href="/analytics" onClick={() => setBell(false)}>Analytics</Link></div>
              {items.length > 0 && (
                <ul className="tb-alerts">
                  {items.map((a) => {
                    const Icon = ALERT_ICON[a.type] ?? Zap;
                    return (
                      <li key={a.id} className={`tb-alert ${a.severity}${a.readAt ? "" : " unread"}`}>
                        <span className="tb-alert-ico"><Icon size={14} /></span>
                        <span className="tb-alert-body">
                          <b>{a.title}</b>
                          <small>{a.body}</small>
                          <time dateTime={a.detectedAt}>{relTime(a.detectedAt)}</time>
                        </span>
                        <button type="button" className="tb-alert-x" aria-label="Dismiss" onClick={() => dismiss(a.id)}><X size={13} /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="tb-pop-sub"><b>Recent activity</b><Link href="/calendar" onClick={() => setBell(false)}>Calendar</Link></div>
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
              ) : items.length === 0 ? <p className="tb-none">Nothing yet. Breakout posts, big changes, competitor moves, niche trends and syncs show up here.</p> : null}
            </div>
          )}
        </div>
        <AccountMenu email={email} plan={plan} placement="below" />
      </div>
    </header>
  );
}
