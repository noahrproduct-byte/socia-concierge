// One line of SIO's speech: every word is in the page from the start (so the
// layout never shifts and a screen reader gets the whole line at once), and
// `shown` of them are visible.
export default function SioWords({ text, shown }: { text: string; shown: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className={i < shown ? "sio-word is-out" : "sio-word"}>{w}{i < words.length - 1 ? " " : ""}</span>
      ))}
    </>
  );
}
