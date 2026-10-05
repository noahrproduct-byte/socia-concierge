// "What changed" — one row of the period's headline numbers against the
// previous period. Shared by every platform's analytics page. A number with no
// comparable previous period says so; it never shows a made-up change.

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
    return <div className="ov-empty small">Not enough data in this period to compare yet.</div>;
  }
  return (
    <ul className="wc-strip">
      {items.map((i) => (
        <li key={i.key}>
          <small>{i.label}</small>
          <b>{i.current}</b>
          {i.delta ? (
            <em className={i.positive === false ? "down" : "up"}>{i.delta}</em>
          ) : (
            <em className="flat">{i.previous != null ? "no change" : "no previous period yet"}</em>
          )}
          {i.previous != null && <span>was {i.previous}</span>}
        </li>
      ))}
    </ul>
  );
}
