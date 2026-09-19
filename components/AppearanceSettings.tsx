"use client";

// Settings → Appearance. Three compact options with a small preview each.
// Selecting one applies instantly on this device. The account copy is
// verified here so the note never claims a save that did not happen.

import { useEffect, useState } from "react";
import { Sun, Moon, SunMoon, Check } from "lucide-react";
import { useTheme, type Appearance } from "@/components/ThemeProvider";
import { isAppearance } from "@/lib/appearance";

const OPTIONS: { value: Appearance; label: string; hint: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright workspace, dark sidebar.", Icon: Sun },
  { value: "dark", label: "Dark", hint: "Deep navy workspace.", Icon: Moon },
  { value: "system", label: "System", hint: "Matches your device appearance.", Icon: SunMoon },
];

function Preview({ value }: { value: Appearance }) {
  // A miniature of the shell: sidebar + workspace + two cards. System shows
  // both halves so the choice reads at a glance.
  const half = value === "system";
  return (
    <span className={`ap-preview ${value}`} aria-hidden>
      <span className="ap-side" />
      <span className="ap-main">
        <span className="ap-card" />
        <span className="ap-card short" />
      </span>
      {half && <span className="ap-split" />}
    </span>
  );
}

/** What the account holds: undefined until read, "unavailable" when the profile
 *  has no appearance column or a save failed, otherwise the stored value. */
type Remote = Appearance | null | "unavailable" | undefined;

export default function AppearanceSettings() {
  const { appearance, resolved, setAppearance, ready } = useTheme();
  const [remote, setRemote] = useState<Remote>(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const p = j?.profile;
        if (!p || !("appearance" in p)) {
          setRemote("unavailable");
          return;
        }
        setRemote(isAppearance(p.appearance) ? p.appearance : null);
      })
      .catch(() => alive && setRemote("unavailable"));
    return () => {
      alive = false;
    };
  }, []);

  async function choose(value: Appearance) {
    // Applies now and stores on this device (ThemeProvider also posts a
    // best-effort account copy, but does not report the outcome).
    setAppearance(value);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: value }),
      });
      const j = res.ok ? await res.json().catch(() => null) : null;
      setRemote(j?.appearanceSaved === true ? value : "unavailable");
    } catch {
      setRemote("unavailable");
    }
  }

  const onAccount = ready && remote !== undefined && remote !== "unavailable" && remote === appearance;
  const deviceOnly = ready && remote !== undefined && !onAccount;
  const where = onAccount
    ? "Saved to your account, so it follows you across devices."
    : deviceOnly
      ? "Saved on this device only."
      : null;
  const note = [ready && appearance === "system" ? `Following your device: currently ${resolved}.` : null, where]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ap">
      <div className="ap-options" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map(({ value, label, hint, Icon }) => {
          const on = ready && appearance === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              className={`ap-option${on ? " on" : ""}`}
              onClick={() => choose(value)}
            >
              <Preview value={value} />
              <span className="ap-label">
                <Icon size={14} />
                <b>{label}</b>
                {on && (
                  <span className="ap-check" aria-hidden>
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </span>
              <small>{hint}</small>
            </button>
          );
        })}
      </div>
      {note && <p className="ap-note">{note}</p>}
    </div>
  );
}
