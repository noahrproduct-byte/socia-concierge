"use client";

// Light, Dark or System (lib/appearance.ts): in Settings as a labelled
// control, and in the account menu as three small buttons. Saved on this
// device at once and on the person's profile, so it follows them.
import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/system";
import { useTheme } from "@/components/ThemeProvider";
import { APPEARANCE_LABEL, type Appearance } from "@/lib/appearance";

const ORDER: Appearance[] = ["light", "dark", "system"];
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** The Settings control, with what System means. */
export function AppearanceSetting() {
  const { appearance, ready, setAppearance } = useTheme();
  return (
    <div className="s-appearance">
      <SegmentedControl
        label="Appearance"
        value={appearance}
        onChange={(v) => setAppearance(v)}
        options={ORDER.map((a) => ({ value: a, label: APPEARANCE_LABEL[a], disabled: !ready }))}
      />
      <p className="s-appearance-note">System follows your device&apos;s light or dark setting. SOCIA&apos;s public pages, like pricing, stay light.</p>
    </div>
  );
}

/** The account menu's row: three icon buttons, the current one pressed. */
export function AppearanceMenuRow() {
  const { appearance, setAppearance } = useTheme();
  return (
    <div className="s-menu-appearance" role="radiogroup" aria-label="Appearance">
      <span>Appearance</span>
      <div>
        {ORDER.map((a) => {
          const Icon = ICON[a];
          return (
            <button key={a} type="button" role="radio" aria-checked={appearance === a} aria-label={APPEARANCE_LABEL[a]} title={APPEARANCE_LABEL[a]}
              className={appearance === a ? "is-on" : undefined} onClick={() => setAppearance(a)}>
              <Icon aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
