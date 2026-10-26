import Link from "next/link";
import Opening from "./Opening";
import Tear from "./Tear";
import { INTRO_FLAG } from "./introFlag";
import "./landing.css";

// The cinematic intro, on its own: the name (Opening) and the SOCIA reveal
// (Tear). It stands in for the original homepage's hero, so it ends on the
// hero's own promise, and the original page continues from its second
// section. The pre-paint script sets the opening's start state before
// hydration, only when the sequence will run (once per browser session,
// never under reduced motion).

const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches||sessionStorage.getItem("${INTRO_FLAG}"))return;d.setAttribute("data-lp-intro","play");setTimeout(function(){if(d.getAttribute("data-lp-intro")==="play")d.removeAttribute("data-lp-intro")},6000)}catch(e){}})();`;

export default function Intro({ footage }: { footage: string | null }) {
  return (
    <div className="lp-root is-intro" data-theme="dark">
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Opening footage={footage} />
      <Tear>
        <div className="lp-wrap">
          <h2 id="h-problem" className="lp-statement">Know what to post <em>before you post it.</em></h2>
          <hr className="lp-statement-rule" />
          <p className="lp-prose">
            SOCIA analyzes your content, competitors, audience, and performance. Then it tells you what to create,
            why it should work, and when to publish it.
          </p>
          <div className="lp-open-actions">
            <Link href="/signup" className="lp-btn is-filled">Start Free Audit</Link>
            <Link href="/login" className="lp-btn">Log in</Link>
          </div>
        </div>
      </Tear>
    </div>
  );
}
