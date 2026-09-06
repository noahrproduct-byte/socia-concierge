"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Right-side drawer with focus management and Escape to close. */
export default function Drawer({ open, title, onClose, children, width = 460 }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ov-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ov-drawer" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <header className="ov-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="ov-x" aria-label="Close" onClick={onClose} autoFocus><X size={16} /></button>
        </header>
        <div className="ov-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
