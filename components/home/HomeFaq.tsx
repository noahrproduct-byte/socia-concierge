"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

// Full-width question rows with a rule between them (the Captions reference),
// one open at a time. Each button names the panel it controls, so a screen
// reader hears the expanded state.

export default function HomeFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="hm-faq">
      {items.map((f, i) => {
        const on = open === i;
        const panel = `${base}-a-${i}`;
        return (
          <div key={f.q} className="hm-faq-item">
            <h3 style={{ margin: 0 }}>
              <button type="button" className="hm-faq-q" aria-expanded={on} aria-controls={panel} onClick={() => setOpen(on ? null : i)}>
                {f.q}
                <Plus aria-hidden />
              </button>
            </h3>
            <div id={panel} className="hm-faq-a" hidden={!on}>
              <p>{f.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
