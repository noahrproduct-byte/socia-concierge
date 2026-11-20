"use client";

// The appearance saved on the person's profile (profiles.appearance), adopted
// on this device when it differs: a choice made on a phone shows on the laptop
// after signing in there. Renders nothing.
import { useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { isAppearance, type Appearance } from "@/lib/appearance";

export default function ThemeSync({ saved }: { saved: Appearance | null }) {
  const { ready, appearance, setAppearance } = useTheme();
  useEffect(() => {
    if (ready && isAppearance(saved) && saved !== appearance) setAppearance(saved, { save: false });
    // Only when the profile's copy arrives or the device's first read finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, saved]);
  return null;
}
