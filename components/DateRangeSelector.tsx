"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { RANGES } from "@/lib/overview";

// Drives the page's real date range via ?range=, so every server-computed
// metric recalculates. The options are the one list the server accepts
// (lib/overview RANGES), so the menu can never offer a range a page ignores.
const OPTIONS: { label: string; days: string }[] = RANGES.map((r) => ({ label: r.label, days: r.id }));

export default function DateRangeSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("range") ?? "30";
  const [open, setOpen] = useState(false);
  const value = OPTIONS.find((o) => o.days === current)?.label ?? "Last 30 days";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="dropwrap" ref={ref}>
      <button className="pill-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <Calendar size={15} />
        {value}
        <ChevronDown size={14} className="drop-chev" />
      </button>
      {open && (
        <div className="dropmenu" role="listbox">
          {OPTIONS.map((o) => (
            <button
              key={o.days}
              className="dropitem"
              role="option"
              aria-selected={o.days === current}
              onClick={() => {
                const next = new URLSearchParams(params.toString());
                next.set("range", o.days);
                router.push(`${pathname}?${next.toString()}`);
                setOpen(false);
              }}
            >
              {o.label}
              {o.days === current && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
