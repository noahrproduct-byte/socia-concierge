"use client";

// Reports the browser's time zone once per session (app/api/timezone), so
// jobs that run on the person's clock, like the Sunday plan, use it. Renders
// nothing.

import { useEffect } from "react";

export default function TimezoneSync() {
  useEffect(() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || sessionStorage.getItem("socia_tz") === tz) return;
    } catch {
      return;
    }
    fetch("/api/timezone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tz }) })
      .then((r) => {
        if (r.ok) try { sessionStorage.setItem("socia_tz", tz); } catch { /* private mode: it reports again next load */ }
      })
      .catch(() => undefined);
  }, []);
  return null;
}
