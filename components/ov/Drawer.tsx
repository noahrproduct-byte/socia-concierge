"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Right-side drawer: Escape closes, focus starts on Close, Tab stays inside, and the opener gets focus back on close. */
export default function Drawer({ open, title, onClose, children, width = 460 }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  // Focus management. Close is focused here rather than with autoFocus so the
  // opener can be captured first (React applies autoFocus before effects run).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onTab = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panel.contains(active);
      if (e.shiftKey ? active === first || !inside : active === last || !inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => { window.removeEventListener("keydown", onTab); opener?.focus?.(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="ov-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={panelRef} className="ov-drawer" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <header className="ov-drawer-head">
          <h2>{title}</h2>
          <button ref={closeRef} type="button" className="ov-x" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="ov-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
