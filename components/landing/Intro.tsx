import Opening from "./Opening";
import Tear from "./Tear";
import { INTRO_FLAG } from "./introFlag";
import "./landing.css";

// The cinematic intro, on its own: the name (Opening), then straight into
// the three product cards (Tear). It stands in for the original homepage's
// hero, and the original page continues from its second section. The pre-paint script sets the opening's start state before
// hydration, only when the sequence will run (once per browser session,
// never under reduced motion).

const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches||sessionStorage.getItem("${INTRO_FLAG}"))return;d.setAttribute("data-lp-intro","play");setTimeout(function(){if(d.getAttribute("data-lp-intro")==="play")d.removeAttribute("data-lp-intro")},6000)}catch(e){}})();`;

export default function Intro({ footage }: { footage: string | null }) {
  return (
    <div className="lp-root is-intro" data-theme="dark">
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Opening footage={footage} />
      <Tear />
    </div>
  );
}
