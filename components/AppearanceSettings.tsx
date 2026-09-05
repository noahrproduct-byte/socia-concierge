"use client";

// Settings → Appearance. Three compact options with a small preview each.
// Selecting one applies instantly; there is nothing to save.

import { Sun, Moon, SunMoon, Check } from "lucide-react";
import { useTheme, type Appearance } from "@/components/ThemeProvider";

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

export default function AppearanceSettings() {
  const { appearance, resolved, setAppearance, ready } = useTheme();
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
              onClick={() => setAppearance(value)}
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
      <p className="ap-note">
        {ready && appearance === "system"
          ? `Following your device: currently ${resolved}.`
          : "Saved to your account, so it follows you across devices."}
      </p>
    </div>
  );
}
