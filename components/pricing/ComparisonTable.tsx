"use client";

// The plan comparison table, generated from lib/pricingTable.ts. Interactive
// but restrained: the plan header row sticks while you scroll, categories
// collapse, rows highlight on hover, and a note becomes a small tooltip rather
// than clutter. Below 760px the wrapper scrolls sideways with the feature
// column pinned, so four columns stay readable on a phone.

import { useState } from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import { PLANS, PLAN_ORDER, formatPrice } from "@/lib/plans";
import { COMPARISON, type Cell } from "@/lib/pricingTable";

function CellView({ cell }: { cell: Cell }) {
  switch (cell.kind) {
    case "yes":
      return <span className="pr-yes"><Check size={15} aria-hidden /><span className="pr-sr">Included</span></span>;
    case "no":
      return <span className="pr-no" aria-label="Not included">–</span>;
    case "soon":
      return <span className="pr-soon">Soon</span>;
    case "text":
      return <span className="pr-cell-text">{cell.text}</span>;
  }
}

export default function ComparisonTable() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (cat: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <div className="pr-table-wrap">
      <table className="pr-table">
        <thead>
          <tr>
            <th scope="col" className="pr-th-feature">Feature</th>
            {PLAN_ORDER.map((id) => (
              <th key={id} scope="col" className={PLANS[id].popular ? "popular" : undefined}>
                <span className="pr-th-name">{PLANS[id].name}</span>
                <span className="pr-th-price">{formatPrice(PLANS[id])}/mo</span>
              </th>
            ))}
          </tr>
        </thead>
        {COMPARISON.map((cat) => {
          const isCollapsed = collapsed.has(cat.category);
          return (
            <tbody key={cat.category} className={isCollapsed ? "collapsed" : undefined}>
              <tr className="pr-cat">
                <th scope="colgroup" colSpan={PLAN_ORDER.length + 1}>
                  <button type="button" className="pr-cat-btn" aria-expanded={!isCollapsed} onClick={() => toggle(cat.category)}>
                    <ChevronDown size={15} className="pr-cat-chev" aria-hidden />
                    {cat.category}
                    <span className="pr-cat-count">{cat.rows.length}</span>
                  </button>
                </th>
              </tr>
              {!isCollapsed && cat.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">
                    <span className="pr-row-label">
                      {row.label}
                      {row.note && (
                        <span className="pr-tip" tabIndex={0} role="note" aria-label={row.note}>
                          <Info size={13} aria-hidden />
                          <span className="pr-tip-bubble">{row.note}</span>
                        </span>
                      )}
                    </span>
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <td key={id} className={PLANS[id].popular ? "popular" : undefined}>
                      <CellView cell={row.cells[id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
