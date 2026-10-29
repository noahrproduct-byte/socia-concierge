"use client";

// The command menu behind ⌘K and the top-bar search: actions, workspaces,
// pages and the person's own posts in one list. Unavailable items stay
// visible, dimmed, with the reason. Keyboard: arrows move, Enter runs, Escape
// closes (the dialog handles focus and the backdrop).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Briefcase, FileText, Link2, MessageCircle, PenLine, Search, Settings, SunMoon } from "lucide-react";
import { NAV } from "@/lib/nav";
import { fetchWorkspaces, markSwitching, requestSwitch, type WorkspaceRow } from "@/lib/workspaceSwitching";
import { captureOutgoingPage } from "@/components/PageTransition";

export type SearchItem = { kind: "page" | "post"; label: string; hint?: string; href: string };

type Command = {
  id: string;
  group: "Actions" | "Workspaces" | "Pages" | "Posts";
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  why?: string;
  run: () => void;
};

const GROUP_ORDER: Command["group"][] = ["Actions", "Workspaces", "Pages", "Posts"];

export function CommandMenu({ open, onOpenChange, index }: { open: boolean; onOpenChange: (open: boolean) => void; index: SearchItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Workspaces are fetched when the menu opens, not on every page load.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    let alive = true;
    fetchWorkspaces().then((d) => {
      if (alive && d?.enabled && d.workspaces) setWorkspaces(d.workspaces);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const close = () => onOpenChange(false);
  const go = (href: string) => {
    close();
    if (href.startsWith("http")) window.open(href, "_blank", "noreferrer");
    else {
      captureOutgoingPage(href);
      router.push(href);
    }
  };

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      { id: "create", group: "Actions", label: "Create post", icon: <PenLine aria-hidden />, run: () => go("/create") },
      { id: "ask", group: "Actions", label: "Ask SOCIA", hint: "a question about your numbers", icon: <MessageCircle aria-hidden />, run: () => { close(); window.dispatchEvent(new CustomEvent("socia:ask")); } },
      { id: "plan", group: "Actions", label: "Open the Content Plan", icon: <FileText aria-hidden />, run: () => go("/tool") },
      { id: "connect", group: "Actions", label: "Connect a platform", hint: "Settings", icon: <Link2 aria-hidden />, run: () => go("/settings#accounts") },
      { id: "appearance", group: "Actions", label: "Change appearance", hint: "Settings", icon: <SunMoon aria-hidden />, run: () => go("/settings#appearance") },
      { id: "settings", group: "Actions", label: "Settings", icon: <Settings aria-hidden />, run: () => go("/settings") },
    ];
    const ws: Command[] = workspaces.map((w) => ({
      id: `ws-${w.id}`,
      group: "Workspaces",
      label: w.active ? `${w.name}` : `Switch to ${w.name}`,
      hint: w.active ? "Active" : undefined,
      icon: <Briefcase aria-hidden />,
      disabled: w.active || w.suspended,
      why: w.suspended ? "Paused" : w.active ? "Active" : undefined,
      run: async () => {
        close();
        markSwitching(w.name);
        const ok = await requestSwitch(w.id);
        if (ok) router.refresh();
        else markSwitching(null);
      },
    }));
    const pages: Command[] = [
      ...NAV.map((n) => ({ id: `page-${n.key}`, group: "Pages" as const, label: n.label, run: () => go(n.href) })),
      ...index.filter((i) => i.kind === "page" && !NAV.some((n) => n.href === i.href)).map((i) => ({ id: `page-${i.href}`, group: "Pages" as const, label: i.label, hint: i.hint, run: () => go(i.href) })),
    ];
    const posts: Command[] = index.filter((i) => i.kind === "post").map((i, k) => ({ id: `post-${k}`, group: "Posts", label: i.label, hint: i.hint, run: () => go(i.href) }));
    return [...actions, ...ws, ...pages, ...posts];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, index]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = s
      ? commands.filter((c) => c.label.toLowerCase().includes(s) || c.hint?.toLowerCase().includes(s))
      : commands.filter((c) => c.group !== "Posts");
    const byGroup = new Map<Command["group"], Command[]>();
    for (const c of hit) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    const out: Command[] = [];
    for (const g of GROUP_ORDER) {
      const list = byGroup.get(g) ?? [];
      out.push(...(g === "Posts" ? list.slice(0, 8) : list));
    }
    return out;
  }, [q, commands]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const c = results[sel];
      if (c && !c.disabled) c.run();
    }
  };

  let lastGroup: Command["group"] | null = null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="s-backdrop" />
        <DialogPrimitive.Popup className="s-dialog s-cmd" aria-label="Search and commands" initialFocus={inputRef}>
          <div className="s-cmd-input">
            <Search aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls="s-cmd-list"
              aria-activedescendant={results[sel] ? `s-cmd-${results[sel].id}` : undefined}
              aria-autocomplete="list"
              placeholder="Search pages, posts and actions"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <ul className="s-cmd-list s-scroll" id="s-cmd-list" role="listbox" ref={listRef}>
            {results.length === 0 && <li className="s-cmd-empty">No matches for &ldquo;{q}&rdquo;.</li>}
            {results.map((c, i) => {
              const showLabel = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <li key={c.id} role="presentation">
                  {showLabel && <div className="s-menu-label">{c.group}</div>}
                  <div
                    id={`s-cmd-${c.id}`}
                    role="option"
                    aria-selected={i === sel}
                    aria-disabled={c.disabled || undefined}
                    data-index={i}
                    className="s-cmd-item"
                    onMouseEnter={() => setSel(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!c.disabled) c.run();
                    }}
                  >
                    {c.icon}
                    <span>{c.label}</span>
                    {c.disabled && c.why ? <small>{c.why}</small> : c.hint ? <small>{c.hint}</small> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="s-cmd-foot">
            <span>Up and down to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
