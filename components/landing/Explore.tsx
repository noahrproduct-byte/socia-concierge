"use client";

import { useState, type ReactNode } from "react";

// Chapter 6: the product as an index. Six rows, one open at a time; the open
// row shows an excerpt of that screen. A list with disclosure, not a grid of
// cards (docs/design/anti-slop-standard.md, section 4).

export type ExploreItem = { id: string; name: string; line: string; excerpt: ReactNode };

export default function Explore({ items }: { items: ExploreItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  return (
    <ol className="lp-index">
      {items.map((it, i) => {
        const isOpen = open === it.id;
        return (
          <li key={it.id}>
            <button type="button" className="lp-index-row" aria-expanded={isOpen} aria-controls={`explore-${it.id}`} onClick={() => setOpen(isOpen ? null : it.id)}>
              <span className="lp-label">{String(i + 1).padStart(2, "0")}</span>
              <h3>{it.name}</h3>
              <p>{it.line}</p>
              <span className="lp-index-toggle">{isOpen ? "Close" : "See it"}</span>
            </button>
            <div className="lp-index-panel" data-open={isOpen} id={`explore-${it.id}`} aria-hidden={!isOpen}>
              <div><div className="lp-mini-screen">{it.excerpt}</div></div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
