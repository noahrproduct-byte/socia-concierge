// "What changed": the period's headline numbers against the previous period,
// one dense row each. Shared by every platform's analytics page. A number with
// no comparable previous period says so; it never shows a made-up change.

import "@/app/(app)/analytics/analytics.css";
import { Empty, StatusPill } from "@/components/system";

export type ChangeItem = {
  key: string;
  label: string;
  current: string;
  previous: string | null;
  delta: string | null;
  positive: boolean | null;
};

export default function WhatChanged({ items }: { items: ChangeItem[] }) {
  if (!items.length) {
    return <Empty>Not enough data in this period to compare yet.</Empty>;
  }
  return (
    <ul className="an-list">
      {items.map((i) => (
        <li key={i.key}>
          <span className="an-row-body">
            <b>{i.label}</b>
            <small>{i.previous != null ? `was ${i.previous}` : "no previous period yet"}</small>
          </span>
          <span className="an-row-end">
            <b>{i.current}</b>
            {i.delta ? (
              <StatusPill tone={i.positive === false ? "negative" : i.positive ? "positive" : "neutral"}>{i.delta}</StatusPill>
            ) : (
              i.previous != null && <StatusPill>no change</StatusPill>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
