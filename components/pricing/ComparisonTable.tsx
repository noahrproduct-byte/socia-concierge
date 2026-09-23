import { Check } from "lucide-react";
import { PLANS, PLAN_ORDER, formatPrice } from "@/lib/plans";
import { COMPARISON, type Cell } from "@/lib/pricingTable";

// One table, generated from lib/pricingTable.ts. Below 760px the wrapper
// scrolls sideways with the feature column pinned, so four columns stay
// readable on a phone instead of shrinking to a smear.

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
        {COMPARISON.map((cat) => (
          <tbody key={cat.category}>
            <tr className="pr-cat">
              <th scope="colgroup" colSpan={PLAN_ORDER.length + 1}>{cat.category}</th>
            </tr>
            {cat.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.note && <small className="pr-row-note">{row.note}</small>}
                </th>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className={PLANS[id].popular ? "popular" : undefined}>
                    <CellView cell={row.cells[id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
