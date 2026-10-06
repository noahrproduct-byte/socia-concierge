"use client";

// While the app switches Brand Workspace the old content stays on screen
// until the refreshed tree arrives. This marks the document so the shell can
// dim the content and show "Switching to <name>…" (globals.css,
// html[data-ws-switching]); both the sidebar switcher and the Settings
// manager use it, so the feedback is identical wherever the switch starts.
export function markSwitching(name: string | null): void {
  if (typeof document === "undefined") return;
  if (name) document.documentElement.setAttribute("data-ws-switching", name);
  else document.documentElement.removeAttribute("data-ws-switching");
}
