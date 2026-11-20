// Runs before first paint: reads the saved appearance (lib/appearance.ts) and
// paints the right theme on <html>, so a dark choice never flashes white.
// "system" follows the device. Must stay in sync with applyResolved in
// components/ThemeProvider.tsx (attribute, class, color-scheme, meta color),
// APPEARANCE_KEY and THEME_COLOR in lib/appearance.ts.

import { LIGHT_ONLY_PATTERN } from "./appearance";

export const SCRIPT = `(function(){try{
var a=null;try{a=localStorage.getItem("socia-appearance")}catch(x){}
if(a!=="light"&&a!=="dark"&&a!=="system")a="light";
var d=a==="dark"||(a==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
if(new RegExp("${LIGHT_ONLY_PATTERN}").test(location.pathname))d=false;
var r=d?"dark":"light",e=document.documentElement;
e.dataset.theme=r;e.classList.toggle("dark",d);e.style.colorScheme=r;
var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m)m.content=d?"#0b0b0c":"#f5f4f1";
}catch(e){}})();`;
