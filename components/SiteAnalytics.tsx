"use client";

// Vercel Web Analytics, minus SOCIA's own team. Opening any page with
// ?dont-count-me saves a flag in that browser and its visits stop being sent
// (Vercel's documented beforeSend opt-out); ?count-me clears it. The flag is
// per browser and per device, so it is set once on each one the team uses.

import { useEffect, useState } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { applyOptParam, optedOut, OPT_IN_PARAM, OPT_OUT_PARAM } from "@/lib/analyticsOptOut";

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === "undefined") return event;
  // The visit that sets the flag is not counted either.
  applyOptParam(window.location.search, window.localStorage);
  return optedOut(window.localStorage) ? null : event;
}

export default function SiteAnalytics() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const changed = applyOptParam(window.location.search, window.localStorage);
    if (!changed) return;
    // Take the parameter out of the address bar, keep everything else.
    const url = new URL(window.location.href);
    url.searchParams.delete(OPT_OUT_PARAM);
    url.searchParams.delete(OPT_IN_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
    setNotice(changed === "out" ? "This browser won't be counted in SOCIA's visitor numbers." : "This browser is counted in SOCIA's visitor numbers again.");
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <Analytics beforeSend={beforeSend} />
      {notice && (
        <div className="s-toasts">
          <div className="s-toast" role="status">{notice}</div>
        </div>
      )}
    </>
  );
}
