"use client";

// The bell: alerts of the active workspace (verified events) and the recent
// activity feed, in one popover. Opening it marks the alerts read.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  FilePen,
  FileText,
  Flame,
  Lightbulb,
  RefreshCw,
  Shuffle,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { IconButton, Popover, PopoverContent, PopoverTrigger } from "@/components/system";
import { relTime, type Activity } from "@/lib/overview";
import { cn } from "@/lib/utils";

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
  cross_platform: Shuffle,
  approval: ClipboardCheck,
};

function post(body: Record<string, string>) {
  fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

export function AlertsBell({ alerts = [], unread = 0, activity }: { alerts?: AlertItem[]; unread?: number; activity: Activity[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AlertItem[]>(alerts);
  const [unreadN, setUnreadN] = useState(unread);
  useEffect(() => {
    setItems(alerts);
    setUnreadN(unread);
  }, [alerts, unread]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && unreadN > 0) {
      setUnreadN(0);
      setItems((xs) => xs.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })));
      post({ action: "read" });
    }
  };
  const dismiss = (id: string) => {
    setItems((xs) => xs.filter((a) => a.id !== id));
    post({ action: "dismiss", id });
  };
  const failed = activity.some((a) => a.kind === "failed");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<IconButton label={`Notifications${unreadN > 0 ? `, ${unreadN} unread` : ""}`} variant="secondary" className="s-bell-btn" />}>
        <Bell />
        {unreadN > 0 ? (
          <span className="s-bell-badge" aria-hidden>
            {unreadN > 9 ? "9+" : unreadN}
          </span>
        ) : failed ? (
          <span className="s-bell-dot" aria-hidden />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="s-bell-pop" aria-label="Notifications">
        <div className="s-bell-head">Notifications</div>
        {items.length > 0 ? (
          <ul className="s-bell-list s-scroll">
            {items.map((a) => {
              const Icon = ALERT_ICON[a.type] ?? Zap;
              const internal = a.entityRef?.startsWith("/") && !a.entityRef.startsWith("//");
              return (
                <li key={a.id} className={cn("s-bell-item", `is-${a.severity}`, !a.readAt && "is-unread")}>
                  <Icon aria-hidden />
                  <span className="s-bell-body">
                    {internal ? (
                      <Link href={a.entityRef as string} onClick={() => setOpen(false)}>
                        <b>{a.title}</b>
                      </Link>
                    ) : (
                      <b>{a.title}</b>
                    )}
                    <small>{a.body}</small>
                    <time dateTime={a.detectedAt}>{relTime(a.detectedAt)}</time>
                  </span>
                  <IconButton label="Dismiss" size="sm" onClick={() => dismiss(a.id)}>
                    <X />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="s-bell-empty">Nothing new. Breakout posts, big changes, competitor moves and trends show up here.</p>
        )}
        <div className="s-bell-head">
          Recent activity
          <Link href="/plan/calendar" className="s-link" onClick={() => setOpen(false)}>
            Calendar
          </Link>
        </div>
        {activity.length ? (
          <ul className="s-bell-list s-scroll">
            {activity.map((a) => {
              const Icon = ACT_ICON[a.kind];
              return (
                <li key={a.id} className={cn("s-bell-item", a.kind === "failed" && "is-failed", (a.kind === "published" || a.kind === "scheduled") && "is-good")}>
                  <Icon aria-hidden />
                  <span className="s-bell-body">
                    <b>{a.title}</b>
                    <small>{a.detail}</small>
                    <time dateTime={a.at}>{relTime(a.at)}</time>
                  </span>
                  <span />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="s-bell-empty">No activity yet. Scheduled and published posts, plans and syncs appear here.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
