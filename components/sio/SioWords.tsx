// One line of SIO's speech: every word is in the page from the start (so the
// layout never shifts and a screen reader gets the whole line at once), and
// `shown` of them are visible. Each word is its own box so it can rise a
// little as it arrives; the spaces sit between the boxes, so lines still wrap.
import { Fragment } from "react";

export default function SioWords({ text, shown }: { text: string; shown: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className={i < shown ? "sio-word is-out" : "sio-word"}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </>
  );
}
