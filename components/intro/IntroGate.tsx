"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INTRO_SEEN_KEY } from "@/lib/intro";
import SociaIntro from "./SociaIntro";

// Plays the intro film over the page it leads into, once. The server only
// renders this when the account has not seen it (lib/intro.ts), so the black
// first frame is in the HTML and nothing behind it shows first. Finishing or
// skipping writes the time to the account, so no other device replays it;
// this browser also remembers, in case that write fails. Closing the tab
// mid-film saves nothing, and the film plays again next time.

const LOCAL = "socia:intro-seen";

export default function IntroGate({ userId }: { userId: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(LOCAL) === userId) setShow(false);
    } catch {
      /* storage blocked: the account flag still decides */
    }
  }, [userId]);

  const done = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(LOCAL, userId);
    } catch {
      /* storage blocked */
    }
    createClient()
      .auth.updateUser({ data: { [INTRO_SEEN_KEY]: new Date().toISOString() } })
      .catch(() => {
        /* this browser still remembers; another device may show it once more */
      });
  }, [userId]);

  return show ? <SociaIntro onDone={done} /> : null;
}
