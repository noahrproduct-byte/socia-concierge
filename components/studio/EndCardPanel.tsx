"use client";

// The ending card in the editor (lib/studioClips/teach.ts): the place, the ask
// and the website, big in the middle of the last shot. SOCIA proposes it; the
// person's words win. Saved when they leave a field, so typing doesn't add a
// step to undo per letter. All three empty means no card.
import { useEffect, useState } from "react";
import { cleanEndCard } from "@/lib/studioClips/teach";
import type { EndCard } from "@/lib/studioClips/types";

const EMPTY: EndCard = { location: "", cta: "", site: "" };
const FIELDS: { key: keyof EndCard; label: string; placeholder: string; max: number }[] = [
  { key: "location", label: "Place", placeholder: "Nashville, Tennessee", max: 40 },
  { key: "cta", label: "The ask", placeholder: "Order now", max: 24 },
  { key: "site", label: "Website", placeholder: "yourshop.com", max: 40 },
];

export default function EndCardPanel({ card, disabled, onChange, onShow }: { card: EndCard | null; disabled: boolean; onChange: (card: EndCard | null) => void; onShow: () => void }) {
  const [draft, setDraft] = useState<EndCard>(card ?? EMPTY);
  useEffect(() => { setDraft(card ?? EMPTY); }, [card]);
  const save = () => {
    const next = cleanEndCard(draft);
    if (JSON.stringify(next) !== JSON.stringify(cleanEndCard(card))) onChange(next);
  };
  return (
    <div className="ov-card cbb-endcard">
      <b>Ending</b>
      <small>Big type in the middle of the last shot. Leave all three empty for no ending.</small>
      <div className="cbb-endcard-fields">
        {FIELDS.map((f) => (
          <label key={f.key} className="cbb-field">{f.label}
            <input type="text" value={draft[f.key]} maxLength={f.max} placeholder={f.placeholder} disabled={disabled} onFocus={onShow} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur={save} />
          </label>
        ))}
      </div>
    </div>
  );
}
