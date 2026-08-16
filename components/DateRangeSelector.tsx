"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";

const OPTIONS = ["Last 7 days", "Last 14 days", "Last 28 days", "Last 90 days", "This month"];

export default function DateRangeSelector() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("Last 7 days");
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
              key={o}
              className="dropitem"
              role="option"
              aria-selected={o === value}
              onClick={() => {
                setValue(o);
                setOpen(false);
              }}
            >
              {o}
              {o === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
