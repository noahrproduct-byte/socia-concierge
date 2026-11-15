"use client";

// Invite links (lib/referrals). On any page, a ?ref=code in the address is
// remembered in a first-party cookie for 30 days, so it survives signing up.
// With `claim` (inside the signed-in app) the remembered code is sent once to
// be recorded against the new account, then forgotten whatever the answer:
// a wrong, late or own code simply doesn't count. Renders nothing.
import { useEffect } from "react";
import { cleanCode } from "@/lib/referrals/core";

const COOKIE = "socia_ref";

function remembered(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)socia_ref=([a-z0-9]{6,12})(?:;|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
const forget = () => { try { document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`; } catch { /* nothing to forget */ } };

export default function RefCapture({ claim = false }: { claim?: boolean }) {
  useEffect(() => {
    try {
      const code = cleanCode(new URLSearchParams(window.location.search).get("ref"));
      if (code) document.cookie = `${COOKIE}=${code}; path=/; max-age=${30 * 86400}; samesite=lax`;
    } catch { /* an address that can't be read has no code */ }
    if (!claim) return;
    const code = remembered();
    if (!code) return;
    fetch("/api/referrals/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
      // Signed out (401) keeps the code for after sign-in; any other answer settles it.
      .then((r) => { if (r.status !== 401) forget(); })
      .catch(() => { /* offline: try again on the next page */ });
  }, [claim]);
  return null;
}
