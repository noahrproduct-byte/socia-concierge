"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INTRO_COOKIE, INTRO_SEEN_KEY } from "@/lib/intro";
import SociaIntro from "./SociaIntro";

// Plays the intro film over the page it leads into, once. The server only
// renders this when it is due (lib/intro.ts), so the black first frame is in
// the HTML and nothing behind it shows first. Finishing or skipping sets a
// cookie for this browser and, when signed in, writes the time to the
// account, so no other device replays it. A new account whose browser already
// saw the film on the homepage (`seen`) only gets the account write. Closing
// the tab mid-film saves nothing, and the film plays again next time.

const LOCAL = "socia:intro-seen";

export default function IntroGate({ userId, seen = false }: { userId?: string; seen?: boolean }) {
  const [show, setShow] = useState(!seen);

  const remember = useCallback(() => {
    document.cookie = `${INTRO_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      localStorage.setItem(LOCAL, userId ?? "visitor");
    } catch {
      /* storage blocked: the cookie and the account still remember */
    }
    if (!userId) return;
    createClient()
      .auth.updateUser({ data: { [INTRO_SEEN_KEY]: new Date().toISOString() } })
      .catch(() => {
        /* this browser still remembers; another device may show it once more */
      });
  }, [userId]);

  useEffect(() => {
    if (seen) {
      remember();
      return;
    }
    try {
      const was = localStorage.getItem(LOCAL);
      if (was && (was === userId || (!userId && was === "visitor"))) setShow(false);
    } catch {
      /* storage blocked: the cookie and the account flag still decide */
    }
  }, [seen, userId, remember]);

  const done = useCallback(() => {
    setShow(false);
    remember();
  }, [remember]);

  return show ? <SociaIntro onDone={done} /> : null;
}
